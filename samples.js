const remToPx = rem => rem*parseFloat(getComputedStyle(document.documentElement).fontSize)

const audioCtx = new window.AudioContext
const gainNode = audioCtx.createGain()
gainNode.gain.value = 1
gainNode.connect(audioCtx.destination)

let samples = []
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
moreActionsBtn.addEventListener("click", (e) => {
	if (!moreActionsPanel.classList.contains("visible")) {
		lastClickEvent = e
		moreActionsPanel.classList.add("visible")
	}
})

window.addEventListener("click", (e) => {
	if (lastClickEvent !== e && moreActionsPanel.classList.contains("visible")) {
		moreActionsPanel.classList.remove("visible")
	}
})

// Reload samples
document.getElementById("reload-button").addEventListener("click", updateSamples)

// sample ordering
document.getElementById("A-Z").addEventListener("change", () => {
	ordering = orderings.AZ
	updateOrdering()
	updateSampleListDisplay()
})
document.getElementById("Z-A").addEventListener("change", () => {
	ordering = orderings.ZA
	updateOrdering()
	updateSampleListDisplay()
})
document.getElementById("filepath").addEventListener("change", () => {
	ordering = orderings.path
	updateOrdering()
	updateSampleListDisplay()
})

function getFileName(filepath) {
	return filepath.split("\\").pop().split("/").pop()
}

// sorts the samples using ordering
function updateOrdering() { samples.sort(ordering) }

function returnSelectedPaths() {
	return Array.from(samples.filter(info => info.selected), x => x.filePath)
}

function createWaveformPath(audioBuffer) {
	const path = {
		path: new Path2D(),
		width: 1920.0,
		height: remToPx(7.0)
	}
	const channelHeight = path.height/audioBuffer.numberOfChannels
	// if the sample is too long then skip some points
	const sampleStep = path.width/audioBuffer.length < 0.5 ? 2 : 1
	const stepSize = path.width/audioBuffer.length

	for (let channel = 0; channel < audioBuffer.numberOfChannels; ++channel) {
		const buffer = audioBuffer.getChannelData(channel)
		path.path.moveTo(0, channelHeight*(channel + 0.5*(buffer[0]+1)))
		for (let sample = 1; sample < audioBuffer.length; sample += sampleStep) {
			path.path.lineTo(sample*stepSize, channelHeight*(channel + 0.5*(buffer[sample]+1)))
			while (sample+1 < audioBuffer.length && buffer[sample] === buffer[sample+1]) { ++sample }
		}
	}
	return Object.freeze(path)
}

function drawWaveform(canvas, path) {
	canvasStyle = window.getComputedStyle(canvas)
	canvas.width = path.width
	canvas.height = path.height
	const ctx = canvas.getContext("2d")
	ctx.strokeStyle = "#B0B0B0"
	ctx.strokeWidth = 1
	ctx.stroke(path.path)
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

function setSampleTags(tagList, sampleInfo) {
	tagList.innerHTML = ""
	for (const tag of sampleInfo.tags) {
		createSampleTagElement(tagList, sampleInfo, tag)
	}
}

function addTag(tagList, sampleInfo, tag) {
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

function removeSampleFromDisplay(sample) {
	const idx = Number(sample.id)
	if (samples[idx].audio) { stopPlayback(samples[idx]) }
	sample.remove()

	hiddenSamples.push(samples.splice(idx, 1)[0])
	updateSampleListDisplay()
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
					addTag(tagList, sampleInfo, tag.name)
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
				// toggle playback for all the selected smaples
				const selectedSamples = samples.filter(sample => sample.selected)
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
		if (sampleInfo) {
			playbackMarker.parentNode.children[0].removeEventListener("mousedown", startScrubbing)
			window.removeEventListener("mousemove", scrub)
			window.removeEventListener("mouseup", stopScrubbing)
			playbackMarker.remove()
			sampleInfo.audio = null
			sampleInfo.DOMelem.children[3].children[1].src = "icons/play_circle_outline.svg"
		}
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
		drawWaveform(sample.children[0].children[3].children[0], sampleInfo.path)
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
			addTag(this.children[0].children[1], sampleInfo, e.dataTransfer.getData("tag"))
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
	sample.children[0].children[3].children[1].addEventListener("mousedown", e => { e.stopPropagation() })

	sample.children[0].children[3].children[1].addEventListener("click", function(e) {
		e.preventDefault()
		e.stopPropagation()
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

function updateSample(sample, sampleInfo) {
	if (sampleInfo.selected) {
		if (!sample.classList.contains("selected-sample")) {
			sample.classList.add("selected-sample")
		}
	} else {
		sample.classList.remove("selected-sample")
	}
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
		top.innerHTML = "No Samples Found"
	} else {
		top.style.height = (start*height).toString() + "px"
		top.style.visible = "hidden"
	}

	const bottom = document.createElement("div")
	bottom.style.visible = "hidden"
	bottom.style.height = ((samples.length-end)*height).toString() + "px"

	list.appendChild(top)
	list.appendChild(bottom)

	for (let i = start; samples[i] && i < end; ++i) {
		if (!samples[i].decoded) {
			samples[i].decoded = true;
			ipcRenderer.send("read-file", samples[i].filePath)
		}
		if (samples[i].DOMelem) {
			samples[i].DOMelem.id = i
			updateSample(samples[i].DOMelem, samples[i])
			list.insertBefore(samples[i].DOMelem, bottom)
		} else {
			list.insertBefore(createSample(samples[i], i), bottom)
		}
	}

	sampleList.appendChild(list)
}

sampleList.addEventListener("scroll", updateSampleListDisplay)

function updateSamples() {
	const match = document.getElementById("searchbar-text").value
	for (const elem of samples) {
		if (elem.audio) { stopPlayback(elem) }
	}
	samples = []
	hiddenSamples = []
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

function filterUpdate() {
	for (const sample of samples) {
		if (sample.audio) { stopPlayback(sample) }
	}
	const filter = Object.freeze({
		tags: getSelectedTags(),
		categories: getSelectedCategories()
	})
	hiddenSamples = [...hiddenSamples, ...samples]
	samples = []
	for (let i = 0; i < hiddenSamples.length; ++i) {
		if (passesFilter(hiddenSamples[i], filter)) {
			samples.push(hiddenSamples.splice(i, 1)[0])
			--i
		}
	}
	updateOrdering()
	updateSampleListDisplay()
}

ipcRenderer.on("add-sample", (e, sampleInfo) => {
	if (new RegExp(document.getElementById("searchbar-text").value).source
		!== sampleInfo.match) { return }
	sampleInfo.selected = false
	sampleInfo.duration = 0
	samples.splice(samples.findIndex( sample => ordering(sample, sampleInfo) > 0 ), 0, sampleInfo)
	updateSampleListDisplay()
})

ipcRenderer.on("file-data", (e, fileData) => {
	audioCtx.decodeAudioData(fileData.buffer.buffer).then(buffer => {
		const sample
			= samples.find(sample => sample.filePath === fileData.filePath)
		if (!sample) { return }
		sample.buffer = buffer
		sample.duration = buffer.duration
		updateDisplayedInfo(sample)
		sample.path = createWaveformPath(sample.buffer)
		drawWaveform(sample.DOMelem.children[3].children[0], sample.path)
	}).catch(err => {
		console.log(`failed to decode: '${fileData.filePath}'`)
		const sample
			= samples.find(sample => sample.filePath === fileData.filePath)
		if (!sample) { return }
		sample.error = err
		updateDisplayedInfo(sample)
	})
})
