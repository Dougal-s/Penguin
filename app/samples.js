'use strict';
const remToPx = rem => rem*parseFloat(getComputedStyle(document.documentElement).fontSize)

const audioCtx = new window.AudioContext
const gainNode = audioCtx.createGain()
gainNode.gain.value = 1
gainNode.connect(audioCtx.destination)

// number of samples to load at one time
let sampleLoadCount = 100

let samples = []
// samples that havent been loaded. The ordering is undefined
let unloadedSamples = []
// for storing samples which do not match the tags or categories
let hiddenSamples = []

const orderings = {
	AZ: (lhs, rhs) => getFileName(lhs.filePath).localeCompare(getFileName(rhs.filePath)),
	ZA: (lhs, rhs) => getFileName(rhs.filePath).localeCompare(getFileName(lhs.filePath)),
	path: (lhs, rhs) => lhs.filePath.localeCompare(rhs.filePath)
}
Object.freeze(orderings)

let ordering = orderings.AZ

const sampleList = document.getElementById("sample-list")
const sampleTemplate = document.getElementById("template-sample")
Object.freeze(sampleTemplate)

const searchBar = document.getElementById("searchbar-text");
searchBar.addEventListener("input", updateSamples);
document.getElementById("delete-icon").addEventListener("click", () => {
	searchBar.value = ""
	updateSamples()
})

// More actions panel
const moreActionsBtn = document.getElementById("more-actions")
const moreActionsPanel = document.getElementById("more-actions-panel")
let lastClickEvent;
moreActionsPanel.addEventListener("click", (e) => lastClickEvent = e)
moreActionsBtn.addEventListener("click", (e) => {
	if (!moreActionsPanel.classList.contains("visible")) {
		lastClickEvent = e
		moreActionsPanel.classList.add("visible")

		function closeMoreActionsPanel(event) {
			if (event !== lastClickEvent) {
				moreActionsPanel.classList.remove("visible")
				window.removeEventListener("click", closeMoreActionsPanel)
			}
		}
		window.addEventListener("click", closeMoreActionsPanel)
	}
})


// Reload samples
document.getElementById("reload-button").addEventListener("click", updateSamples)

// sample ordering
document.getElementById("A-Z").addEventListener("change", () => {
	updateOrdering(orderings.AZ)
	updateSampleListDisplay()
})
document.getElementById("Z-A").addEventListener("change", () => {
	updateOrdering(orderings.ZA)
	updateSampleListDisplay()
})
document.getElementById("filepath").addEventListener("change", () => {
	updateOrdering(orderings.path)
	updateSampleListDisplay()
})

function getFileName(filepath) {
	return filepath.split("\\").pop().split("/").pop()
}

// sorts the samples using ordering
function updateOrdering(newOrdering) {
	ordering = newOrdering
	samples = [...samples, ...unloadedSamples]
	samples.sort(ordering)
	unloadedSamples = samples.splice(maxSamples)
}

function returnSelectedPaths() {
	return Array.from(samples.filter(info => info.selected), x => x.filePath)
}

function drawWaveform(sampleInfo) {
	const canvas = sampleInfo.DOMelem.children[3].children[0]
	const width = 1920.0
	const height = remToPx(7.0)

	canvas.width = width
	canvas.height = height

	const ctx = canvas.getContext("2d")
	ctx.strokeStyle = "#B0B0B0"
	ctx.strokeWidth = 1
	ctx.beginPath()

	const channelHeight = height/sampleInfo.buffer.numberOfChannels
	// if the sample is too long then skip some points
	const sampleStep = width/sampleInfo.buffer.length < 0.5 ? 2 : 1
	const stepSize = width/sampleInfo.buffer.length

	for (let channel = 0; channel < sampleInfo.buffer.numberOfChannels; ++channel) {
		const buffer = sampleInfo.buffer.getChannelData(channel)
		ctx.moveTo(0, channelHeight*(channel + 0.5*(buffer[0]+1)))
		for (let sample = 1; sample < sampleInfo.buffer.length; sample += sampleStep) {
			ctx.lineTo(sample*stepSize, channelHeight*(channel + 0.5*(buffer[sample]+1)))
			while (sample+1 < sampleInfo.buffer.length && buffer[sample] === buffer[sample+1]) { ++sample }
		}
	}

	ctx.stroke()
}

const templateTag = document.getElementById("template-tag")
Object.freeze(templateTag)
function createSampleTagElement(tagList, sampleInfo, tag) {
	const tagElem = templateTag.content.cloneNode(true)
	tagElem.children[0].innerHTML = tag

	const sampleMenu = Menu.buildFromTemplate([{
		label: "remove tag",
		click() { removeTag(sampleInfo, tag) }
	}])

	tagElem.children[0].addEventListener("mousedown", e => { e.stopPropagation() })

	tagElem.children[0].addEventListener("contextmenu", (e) => {
		sampleMenu.popup({ window: remote.getCurrentWindow() })
		e.preventDefault()
		e.stopPropagation()
	})

	tagList.appendChild(tagElem)
}

function removeSampleFromDisplay(sample) {
	const idx = Number(sample.id)
	if (samples[idx].audio) { stopPlayback(samples[idx]) }
	sample.remove()

	hiddenSamples.push(samples.splice(idx, 1)[0])
	updateSampleListDisplay()
}

// Modify Sample Tags

function setSampleTags(tagList, sampleInfo) {
	tagList.innerHTML = ""
	for (const tag of sampleInfo.tags) {
		createSampleTagElement(tagList, sampleInfo, tag)
	}
}

function addTag(sampleInfo, tag) {
	const tagList = sampleInfo.DOMelem.getElementsByClassName("tag-list")[0]
	if (sampleInfo.tags.includes(tag)) { return }
	sampleInfo.tags.push(tag)
	ipcRenderer.send("update-sample-info", {
		samplePath: sampleInfo.filePath,
		updateTarget: "tags",
		updateData: sampleInfo.tags
	})
	createSampleTagElement(tagList, sampleInfo, tag)
	setSampleContextMenu(sampleInfo)
}

function removeTag(sampleInfo, tag) {
	const tagList = sampleInfo.DOMelem.getElementsByClassName("tag-list")[0]
	const selectedTags = getSelectedTags()
	sampleInfo.tags.splice(sampleInfo.tags.indexOf(tag), 1)
	ipcRenderer.send("update-sample-info", {
		samplePath: sampleInfo.filePath,
		updateTarget: "tags",
		updateData: sampleInfo.tags
	})
	if (selectedTags.some(tagInfo => tagInfo.name === tag)) {
		removeSampleFromDisplay(tagList.parentNode.parentNode)
		return
	}
	Array.from(tagList.children).find(elem => elem.innerHTML === tag).remove()
	setSampleContextMenu(sampleInfo)
}

// Modify Sample Categories

function addCategory(sampleInfo, category) {
	if (sampleInfo.categories.includes(category)) { return }

	sampleInfo.categories.push(category)
	ipcRenderer.send("update-sample-info", {
		samplePath: sampleInfo.filePath,
		updateTarget: "categories",
		updateData: sampleInfo.categories
	})
	setSampleContextMenu(sampleInfo)
}

function removeCategory(sampleInfo, category) {
	const selectedCategory = document.getElementById("selected-category")
	sampleInfo.categories.splice(sampleInfo.categories.indexOf(category), 1)
	ipcRenderer.send("update-sample-info", {
		samplePath: sampleInfo.filePath,
		updateTarget: "categories",
		updateData: sampleInfo.categories
	})

	if (selectedCategory && selectedCategory.innerHTML == category) {
		removeSampleFromDisplay(sampleInfo.DOMelem)
		return
	}

	setSampleContextMenu(sampleInfo)
}

function setSampleContextMenu(sampleInfo) {
	const tagList = sampleInfo.DOMelem.getElementsByClassName("tag-list")[0]
	const menuTemplate = [
		{
			label: "remove from selected category",
			click() {
				const category = document.getElementById("selected-category")
				if (category) { removeCategory(sampleInfo, category.innerHTML) }
			}
		},
		{
			type: "submenu",
			label: "add to categories",
			submenu: [...categoryList.children].filter(category => category.children.length === 0).map(category => ({
				label: category.innerHTML,
				click() { addCategory(sampleInfo, category.innerHTML) }
			}))
		},
		{
			type: "submenu",
			label: "remove from category",
			submenu: sampleInfo.categories.map(category => ({
				label: category,
				click() { removeCategory(sampleInfo, category) }
			}))
		},
		{
			type: "submenu",
			label: "add tag",
			submenu: tagInfos.map(tag => ({
				label: tag.name,
				click() {
					addTag(sampleInfo, tag.name)
				}
			}))
		},
		{
			type: "submenu",
			label: "remove tag",
			submenu: sampleInfo.tags.map(tag => ({
				label: tag,
				click() { removeTag(sampleInfo, tag) }
			}))
		}
	]
	window.requestIdleCallback(() => {
		const sampleMenu = Menu.buildFromTemplate(menuTemplate)

		sampleInfo.DOMelem.oncontextmenu = e => {
			sampleMenu.popup({ window: remote.getCurrentWindow() })
			e.preventDefault()
			e.stopPropagation()
		}
	})
}

function updateContextMenus() {
	for (const sample of samples) {
		if (sample.DOMelem) { setSampleContextMenu(sample) }
	}
}

function isVisible(idx) {
	const height = remToPx(13.5)+1
	const start = Math.min(samples.length-1, Math.floor(sampleList.scrollTop/height))
	const end = Math.min(samples.length, Math.ceil((sampleList.scrollTop+sampleList.offsetHeight)/height))
	return start < idx && idx < end-1
}

let lastSelectedIndex = -1
let shiftPoint = -1
// keyboard events
window.addEventListener("keydown", (e) => {
	if (document.activeElement.tagName === "BODY") {
		const height = remToPx(13.5)+1
		switch (e.code) {
			case "ArrowDown":
				e.preventDefault()
				if (lastSelectedIndex+1 < samples.length) {
					for (const sample of samples) { sample.selected = false }
					++lastSelectedIndex
					if (e.shiftKey) {
						if (shiftPoint === -1) {
							shiftPoint = Math.max(lastSelectedIndex-1, 0)
						}
						const start = Math.min(lastSelectedIndex, shiftPoint)
						const end = Math.max(lastSelectedIndex, shiftPoint)
						for (let i = start; i <= end; ++i) {
							samples[i].selected = true;
						}
						if (!isVisible(end)) {
							sampleList.scrollTo(0, height*(end+1)-sampleList.offsetHeight)
						}
					} else {
						shiftPoint = -1
						samples[lastSelectedIndex].selected = true
						if (!isVisible(lastSelectedIndex)) {
							sampleList.scrollTo(0, height*(lastSelectedIndex+1)-sampleList.offsetHeight)
						}
					}
					updateSampleListDisplay()
				}
				break;
			case "ArrowUp":
				e.preventDefault()
				if (lastSelectedIndex > 0) {
					for (const sample of samples) { sample.selected = false }
					--lastSelectedIndex
					if (e.shiftKey) {
						if (shiftPoint === -1) {
							shiftPoint = lastSelectedIndex+1
						}
						const start = Math.min(lastSelectedIndex, shiftPoint)
						const end = Math.max(lastSelectedIndex, shiftPoint)
						for (let i = start; i <= end; ++i) {
							samples[i].selected = true;
						}
						if (!isVisible(end)) {
							sampleList.scrollTo(0, height*end)
						}
					} else {
						shiftPoint = -1
						samples[lastSelectedIndex].selected = true
						if (!isVisible(lastSelectedIndex)) {
							sampleList.scrollTo(0, height*lastSelectedIndex)
						}
					}
					updateSampleListDisplay()
				}
				break;
			case "Space":
			case "Enter":
				e.preventDefault()
				for (const sample of samples) {
					if (!sample.buffer) { continue }
					if (!sample.selected) {
						if (sample.audio) { stopPlayback(sample) }
						continue
					}

					if (sample.audio) { stopPlayback(sample) }
					else { startSamplePlayback(sample) }
				}
				break
		}
	}
})

function stopPlayback(sampleInfo) {
	sampleInfo.gainNode.gain.setValueAtTime(sampleInfo.gainNode.gain.value, audioCtx.currentTime)
	sampleInfo.gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.015)
	const audioNode = sampleInfo.audio
	sampleInfo.audio = null
	window.setTimeout(() => { audioNode.stop() }, 15)
}

function startSamplePlayback(sampleInfo) {
	sampleInfo.gainNode = audioCtx.createGain()
	sampleInfo.gainNode.gain.value = 1
	sampleInfo.gainNode.connect(gainNode)

	const playbackMarker = document.createElement("div")
	playbackMarker.classList.add("playback-marker")
	sampleInfo.DOMelem.children[3].append(playbackMarker)

	let scrubbing = false
	const startAudio = (offset) => {
		sampleInfo.audio = audioCtx.createBufferSource()
		sampleInfo.audio.addEventListener("ended", audioEndEventListener)
		sampleInfo.audio.buffer = sampleInfo.buffer
		sampleInfo.audio.connect(sampleInfo.gainNode)
		sampleInfo.audio.start(0, offset)
		const startTime = audioCtx.currentTime-offset
		function movePlaybackMarker() {
			if (!scrubbing && sampleInfo.audio && playbackMarker.parentNode) {
				const elapsed = audioCtx.currentTime - startTime
				const length = sampleInfo.duration
				const width = playbackMarker.parentNode.children[0].offsetWidth
				playbackMarker.style.left = elapsed/length * width + "px"
				window.requestAnimationFrame(movePlaybackMarker)
			}
		}
		window.requestAnimationFrame(movePlaybackMarker)
		sampleInfo.DOMelem.children[3].children[1].src = "icons/pause_circle_outline.svg"
	}

	function startScrubbing(e) {
		sampleInfo.gainNode.gain.setValueAtTime(sampleInfo.gainNode.gain.value, audioCtx.currentTime)
		sampleInfo.gainNode.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.01)
		scrubbing = true
		sampleInfo.audio.removeEventListener("ended", audioEndEventListener)
		scrub(e)
	}

	function scrub(e) {
		if (scrubbing) {
			const parentBox = playbackMarker.parentNode.children[0].getBoundingClientRect()
			playbackMarker.style.left = Math.min(parentBox.width, Math.max(0, e.clientX-parentBox.left)) + "px"
		}
	}

	function stopScrubbing(e) {
		if (scrubbing) {
			sampleInfo.audio.stop()
			sampleInfo.audio = null
			sampleInfo.gainNode.gain.setValueAtTime(sampleInfo.gainNode.gain.value, audioCtx.currentTime)
			sampleInfo.gainNode.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 0.001)
			scrubbing = false
			const parentBox = playbackMarker.parentNode.children[0].getBoundingClientRect()
			const offset = sampleInfo.duration*Math.min(parentBox.width, Math.max(0, e.clientX-parentBox.left))/parentBox.width
			startAudio(offset)
		}
	}

	const audioEndEventListener = () => {
		playbackMarker.parentNode.children[0].removeEventListener("mousedown", startScrubbing)
		window.removeEventListener("mousemove", scrub)
		window.removeEventListener("mouseup", stopScrubbing)
		playbackMarker.remove()
		sampleInfo.audio = null
		sampleInfo.DOMelem.children[3].children[1].src = "icons/play_circle_outline.svg"
	}

	playbackMarker.parentNode.children[0].addEventListener("mousedown", startScrubbing)
	window.addEventListener("mousemove", scrub)
	window.addEventListener("mouseup", stopScrubbing)

	startAudio(0)
}

function createSample(sampleInfo, idx) {
	const sample = sampleTemplate.content.cloneNode(true)
	sampleInfo.DOMelem = sample.children[0]

	sample.children[0].id = idx

	if (sampleInfo.selected) {
		sample.children[0].classList.add("selected-sample")
	}

	if (sampleInfo.error) {
		sample.children[0].classList.add("decode-error")
		sample.children[0].children[3].children[3].children[1].innerHTML = sampleInfo.error
	}

	// set sample name
	sample.children[0].children[0].children[0].innerHTML
		= getFileName(sampleInfo.filePath)

	// set sample path
	sample.children[0].children[1].innerHTML = sampleInfo.filePath

	// set sample length
	const duration = Math.round(sampleInfo.duration)
	sample.children[0].children[3].children[2].innerHTML
		= Math.floor(duration/60).toString() + ":"
		+ ("0"+(duration%60).toString()).slice(-2)

	// set sample tags
	const tagList = sample.children[0].getElementsByClassName("tag-list")[0]
	setSampleTags(tagList, sampleInfo)

	if (sampleInfo.path) {
		drawWaveform(sampleInfo)
	}

	if (sampleInfo.audio) {
		sample.children[0].children[3].children[1].src = "icons/pause_circle_outline.svg"
	} else {
		sample.children[0].children[3].children[1].src = "icons/play_circle_outline.svg"
	}

	// handle drag and drop events

	// to allow droping on the sample
	sample.children[0].addEventListener("dragover", (e) => { e.preventDefault() })
	sample.children[0].addEventListener("dragenter", (e) => { e.preventDefault() })

	// drag and drop tags
	sample.children[0].addEventListener("dragenter", function(e) {
		if (dragEventType === dragTypes.tag) {
			const tagElem = templateTag.content.cloneNode(true)
			tagElem.children[0].style.opacity = "50%"
			this.children[0].children[1].appendChild(tagElem)
		}
	})

	sample.children[0].addEventListener("dragleave", function(e) {
		if (dragEventType === dragTypes.tag) {
			this.children[0].children[1].lastChild.remove()
		}
	})

	sample.children[0].addEventListener("drop", function(e) {
		if (dragEventType === dragTypes.tag) {
			this.children[0].children[1].lastChild.remove()
			addTag(sampleInfo, e.dataTransfer.getData("tag"))
		}
	})

	// drag and drop categories

	sample.children[0].addEventListener("drop", function(e) {
		if (dragEventType === dragTypes.category) {
			addCategory(sampleInfo, e.dataTransfer.getData("category"))
		}
	})

	// drag and drop from the sample

	sample.children[0].addEventListener("dragstart", e => {
		e.preventDefault()
		ipcRenderer.send("ondragstart", returnSelectedPaths())
	})

	sample.children[0].children[3].addEventListener("dragstart", e => {
		e.preventDefault()
		e.stopPropagation()
	})

	// Click events
	let deselect = false
	sample.children[0].addEventListener("mousedown", function(e) {
		deselect = false
		if (e.button !== 0) { return }

		const idx = Number(this.id)
		if (e.shiftKey && lastSelectedIndex !== -1) {
            const rangeStart = Math.min(lastSelectedIndex, idx)
            const rangeEnd = Math.max(lastSelectedIndex, idx)
	        if (!e.ctrlKey) {
	            for (const elem of samples) elem.selected = false
			}
			for (let i = rangeStart; i <= rangeEnd; ++i) {
				samples[i].selected = true
			}
			updateSampleListDisplay()
			return
		}

		if (sampleInfo.selected) {
			deselect = true
			return
		}

        if (!e.ctrlKey) {
            for (const elem of samples) elem.selected = false
		}

		sampleInfo.selected = true
		lastSelectedIndex = idx
		updateSampleListDisplay()
	})

	sample.children[0].addEventListener("mouseup", function(e) {
		if (e.button !== 0) { return }
		if (deselect) {
			if (e.ctrlKey || samples.filter(info => info.selected).length === 1) {
				sampleInfo.selected = false
				lastSelectedIndex = -1
			} else {
				for (const elem of samples) elem.selected = false
				sampleInfo.selected = true
				lastSelectedIndex = Number(this.id)
			}
			updateSampleListDisplay()
			deselect = false;
		}
	})

	setSampleContextMenu(sampleInfo)

	sample.children[0].children[3].addEventListener("mousedown", e => {
		e.preventDefault()
		e.stopPropagation()
	})

	sample.children[0].children[3].children[1].addEventListener("click", function(e) {
		if (!sampleInfo.buffer) { return }
		if (sampleInfo.audio) {
			stopPlayback(sampleInfo)
		} else {
			for (const elem of samples) {
				if (elem.audio) { stopPlayback(elem) }
			}
			startSamplePlayback(sampleInfo)
		}
	})

	return sample.children[0]
}

function updateDisplayedInfo(sampleInfo) {
	if (!sampleInfo.DOMelem) { return }

	// set error message
	if (sampleInfo.error) {
		if (!sampleInfo.DOMelem.classList.contains("decode-error")) {
			sampleInfo.DOMelem.classList.add("decode-error")
		}
		sampleInfo.DOMelem.children[3].children[3].children[1].innerHTML = sampleInfo.error
	}

	// set sample length
	const duration = Math.round(sampleInfo.duration)
	sampleInfo.DOMelem.children[3].children[2].innerHTML
		= Math.floor(duration/60).toString() + ":"
		+ ("0"+(duration%60).toString()).slice(-2)
}

function updateSample(sampleInfo) {
	if (sampleInfo.selected) {
		if (!sampleInfo.DOMelem.classList.contains("selected-sample")) {
			sampleInfo.DOMelem.classList.add("selected-sample")
		}
	} else {
		sampleInfo.DOMelem.classList.remove("selected-sample")
	}
}

function loadSamples() {
	maxSamples += sampleLoadCount
	for (let i = 0; i < Math.min(unloadedSamples.length, sampleLoadCount); ++i) {
		const minIndex = unloadedSamples.reduce(
			(acc, curr, idx, src) => src[acc] < curr ? acc : idx,
			0
		)
		samples.push(unloadedSamples.splice(minIndex, 1)[0])
	}
	updateSampleListDisplay()
}

function updateSampleListDisplay() {
	const height = remToPx(13.5)+1
	// The first element on the screen
	const start = Math.min(samples.length-1, Math.floor(sampleList.scrollTop/height))
	// find first element that is below the screen
	const end = Math.min(samples.length, Math.ceil((sampleList.scrollTop+sampleList.offsetHeight)/height))

	while (2 < sampleList.children.length) { sampleList.children[1].remove() }

	sampleList.innerHTML = ""
	const list = document.createDocumentFragment()

	const top = document.createElement("div")
	if (getSamplePaths().length === 0) {
		top.style.height = "100%"
		top.innerHTML = "Samples Directories Not Set"
	} else if (samples.length === 0) {
		top.style.height = "100%"
		top.style.userSelect = "none";
		top.innerHTML = "No Samples Found"
	} else {
		top.style.height = (start*height).toString() + "px"
		top.style.visible = "hidden"
	}

	const bottom = document.createElement("div")
	if (unloadedSamples.length === 0) {
		bottom.style.visible = "hidden"
		bottom.style.height = ((samples.length-end)*height).toString() + "px"
	} else {
		bottom.style.height = ((samples.length-end)*height+remToPx(4)).toString() + "px"
		bottom.appendChild(document.createElement("div"))
		bottom.children[0].id = "load-samples-btn"
		bottom.children[0].innerHTML = "load " + Math.min(unloadedSamples.length, sampleLoadCount) + " more"
		bottom.children[0].addEventListener("click", loadSamples)
	}

	list.appendChild(top)
	list.appendChild(bottom)

	for (let i = start; samples[i] && i < end; ++i) {
		if (!samples[i].decoded) {
			samples[i].decoded = true;
			ipcRenderer.send("read-file", samples[i].filePath)
		}
		if (samples[i].DOMelem) {
			samples[i].DOMelem.id = i
			updateSample(samples[i])
			list.insertBefore(samples[i].DOMelem, bottom)
		} else {
			list.insertBefore(createSample(samples[i], i), bottom)
		}
	}

	sampleList.appendChild(list)
}

sampleList.addEventListener("scroll", updateSampleListDisplay)

function updateSamples() {
	const match = searchBar.value
	for (const elem of samples) {
		if (elem.audio) { stopPlayback(elem) }
	}
	samples = []
	hiddenSamples = []
	unloadedSamples = []
	maxSamples = sampleLoadCount
	updateSampleListDisplay()
	ipcRenderer.send("update-samples", match)
}

// called when a tag or category is selected/deselected
function passesFilter(sampleInfo, filter) {
	for (const tag of filter.tags) {
		if (!sampleInfo.tags.includes(tag.name)) { return false }
	}

	if (!filter.categories.length) { return true }

	for (const category of sampleInfo.categories) {
		if (filter.categories.includes(category)) { return true }
	}

	return false
}

 const filterChange = {
	 add: 2,
	 swap: 1,
	 remove: 0
}
Object.freeze(filterChange)
function filterUpdate(change) {
	for (const sample of samples) {
		if (sample.audio) { stopPlayback(sample) }
	}
	const filter = Object.freeze({
		tags: getSelectedTags(),
		categories: getSelectedCategories()
	})
	maxSamples = sampleLoadCount
	switch (change) {
		case filterChange.add:
			samples = [...samples, ...unloadedSamples]
			for (let i = 0; i < samples.length; ++i) {
				if (!passesFilter(samples[i], filter)) {
					hiddenSamples.push(samples.splice(i, 1)[0])
					--i
				}
			}
			unloadedSamples = samples.splice(maxSamples)
			break;
		case filterChange.swap:
		case filterChange.remove:
			hiddenSamples = [...samples, ...unloadedSamples, ...hiddenSamples]
			samples = []
			hiddenSamples.sort(ordering)
			unloadedSamples = []
			for (let i = 0; i < hiddenSamples.length; ++i) {
				if (passesFilter(hiddenSamples[i], filter)) {
					if (samples.length === maxSamples) {
						unloadedSamples.push(hiddenSamples.splice(i, 1)[0])
					} else {
						samples.push(hiddenSamples.splice(i, 1)[0])
					}
					--i;
				}
			}
			break;
	}
	updateSampleListDisplay()
}

// Returns true if updateSampleListDisplay needs to be called
function addSample(sampleInfo) {
	let index = samples.length
	while (index--) {
		if (ordering(samples[index], sampleInfo) <= 0) { break }
	}
	++index;
	if (index < maxSamples) {
		samples.splice(index, 0, sampleInfo)
		if (samples.length > maxSamples) {
			unloadedSamples.push(samples.pop())
		}

		const height = remToPx(13.5)+1

		// The first element on the screen
		const start = Math.min(samples.length-1, Math.floor(sampleList.scrollTop/height))
		const top = sampleList.firstElementChild
		if (index < start) {
			top.style.height = toString(Number(top.style.height) + height) + "px"
			return
		}

		// find first element that is below the screen
		const end = Math.min(samples.length, Math.ceil((sampleList.scrollTop+sampleList.offsetHeight)/height))
		const bottom = sampleList.lastElementChild
		if (index >= end) {
			bottom.style.height = toString(Number(bottom.style.height) + height) + "px"
			return
		}

		updateSampleListDisplay()
	} else {
		unloadedSamples.push(sampleInfo)
	}
}

// maximum number of samples
let maxSamples = sampleLoadCount
ipcRenderer.on("add-sample", (e, sampleInfo, match) => {
	if (new RegExp(searchBar.value).source !== match) { return }
	sampleInfo.selected = false
	sampleInfo.duration = 0
	const filter = Object.freeze({
		tags: getSelectedTags(),
		categories: getSelectedCategories()
	})
	if (!passesFilter(sampleInfo, filter)) { hiddenSamples.push(sampleInfo) }
	else { addSample(sampleInfo) }
})

ipcRenderer.on("file-data", (e, fileData) => {
	audioCtx.decodeAudioData(fileData.buffer.buffer).then(buffer => {
		const sample
			= samples.find(sample => sample.filePath === fileData.filePath)
		if (!sample) { return }
		sample.buffer = Object.freeze(buffer)
		sample.duration = buffer.duration
		updateDisplayedInfo(sample)
		drawWaveform(sample)
	}).catch(err => {
		console.log(`failed to decode: '${fileData.filePath}'`)
		const sample
			= samples.find(sample => sample.filePath === fileData.filePath)
		if (!sample) { return }
		sample.error = err
		updateDisplayedInfo(sample)
	})
})
