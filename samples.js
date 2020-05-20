const { remote, ipcRenderer } = require('electron')
const { dialog, Menu, MenuItem } = remote

const remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);

let audioCtx = new window.AudioContext
let gainNode = audioCtx.createGain()
gainNode.gain.value = 1
gainNode.connect(audioCtx.destination)

let samples = []

let sampleList = document.getElementById('sample-list')
const sampleTemplate = document.getElementById('template-sample')

function returnSelectedPaths() {
	return Array.from(samples.filter(info => info.selected), x => x.filePath)
}

function createWaveformPath(audioBuffer) {
	path = {
		path: new Path2D(),
		width: 1920,
		height: 7.0*remToPx
	}
	const channelHeight = path.height/audioBuffer.numberOfChannels
	const stepSize = path.width/audioBuffer.length

	for (let channel = 0; channel < audioBuffer.numberOfChannels; ++channel) {
		let buffer = audioBuffer.getChannelData(channel)
		path.path.moveTo(0, channelHeight*(channel + 0.5*(buffer[0]+1)))
		for (let sample = 1; sample < audioBuffer.length; ++sample) {
			path.path.lineTo(sample*stepSize, channelHeight*(channel + 0.5*(buffer[sample]+1)))
		}
	}
	return path
}

function drawWaveform(canvas, path) {
	canvasStyle = window.getComputedStyle(canvas)
	canvas.width = path.width
	canvas.height = path.height
	const ctx = canvas.getContext('2d')
	ctx.strokeStyle = '#B0B0B0'
	ctx.strokeWidth = 1
	ctx.stroke(path.path)
}

function removeTag(tagList, idx, tag) {
	samples[idx].tags.splice(samples[idx].tags.indexOf(tag), 1)
	Array.from(tagList.children).find(elem => elem.innerHTML === tag).remove()
	setSampleContextMenu(tagList.parentElement.parentElement, idx)
}

let templateTag = document.getElementById('template-tag')
function setSampleTags(tagList, idx) {
	tagList.innerHTML = ""
	for (const tag of samples[idx].tags) {
		let tagElem = templateTag.content.cloneNode(true)
		tagElem.children[0].innerHTML = tag

		let sampleMenu = new Menu
		sampleMenu.append(
			new MenuItem({
				label: "remove tag",
				click() { removeTag(tagList, idx, tag) }
			})
		)

		tagElem.children[0].addEventListener("mousedown", e => { e.stopPropagation() })

		tagElem.children[0].addEventListener('contextmenu', (e) => {
			sampleMenu.popup({ window: remote.getCurrentWindow() })
			e.preventDefault()
			e.stopPropagation()
		})

		tagList.appendChild(tagElem)
	}
}

function setSampleContextMenu(sample, idx) {
	// context menu
	let sampleMenu = new Menu
	sampleMenu.append(
		new MenuItem({
			label: "remove from selected category",
			click() {
				let category = document.getElementById('selected-category')
				if (category) {
					samples[idx].categories.splice(samples[idx].categories.indexOf(category.innerHTML), 1)
					setSampleContextMenu(sample, idx)
				}
			}
		})
	)
	let contextMenuCategories = [];
	for (const category of samples[idx].categories) {
		contextMenuCategories.push({
			label: category,
			click() {
				samples[idx].categories.splice(samples[idx].categories.indexOf(category), 1)
				setSampleContextMenu(sample, idx)
			}
		})
	}
	sampleMenu.append(
		new MenuItem({
			type: "submenu",
			label: "remove from category",
			submenu: contextMenuCategories
		})
	)

	let contextMenuTags = [];
	let tagList = sample.children[0].getElementsByClassName('tag-list')[0]
	for (const tag of samples[idx].tags) {
		contextMenuTags.push({
			label: tag,
			click() { removeTag(tagList, idx, tag) }
		})
	}
	sampleMenu.append(
		new MenuItem({
			type: "submenu",
			label: "remove tag",
			submenu: contextMenuTags
		})
	)

	sample.children[0].oncontextmenu = e => {
		sampleMenu.popup({ window: remote.getCurrentWindow() })
		e.preventDefault()
		e.stopPropagation()
	}
}

let lastSelectedIndex = 0
function createSample(sampleInfo, idx) {
	let sample = sampleTemplate.content.cloneNode(true)

	sample.children[0].id = idx

	if (sampleInfo.selected) {
		sample.children[0].classList.add('selected-sample')
	}

	if (sampleInfo.error) {
		sample.children[0].classList.add('decode-error')
		sample.children[0].children[3].children[3].children[1].innerHTML = sampleInfo.error
	}

	// set sample name
	sample.children[0].children[0].children[0].innerHTML
		= sampleInfo.filePath.split('\\').pop().split('/').pop()

	// set sample path
	sample.children[0].children[1].innerHTML = sampleInfo.filePath

	// set sample length
	let duration = Math.round(sampleInfo.duration)
	sample.children[0].children[3].children[2].innerHTML
		= Math.floor(duration/60).toString() + ':'
		+ ('0'+(duration%60).toString()).slice(-2)

	// set sample tags
	let tagList = sample.children[0].getElementsByClassName('tag-list')[0]
	setSampleTags(tagList, idx)

	if (samples[idx].path) {
		drawWaveform(sample.children[0].children[3].children[0], samples[idx].path)
	}

	if (samples[idx].audio) {
		sample.children[0].children[3].children[1].src = "icons/pause_circle_outline.svg"
	} else {
		sample.children[0].children[3].children[1].src = "icons/play_circle_outline.svg"
	}

	// Click events
	let deselect = false
	sample.children[0].addEventListener("mousedown", e => {
		deselect = false
		if (e.button !== 0) { return }

		if (e.shiftKey && lastSelectedIndex != -1) {
            let rangeStart = Math.min(lastSelectedIndex, idx)
            let rangeEnd = Math.max(lastSelectedIndex, idx)
	        if (!e.ctrlKey) {
	            for (let elem of samples) elem.selected = false
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
            for (let elem of samples) elem.selected = false
		}

		sampleInfo.selected = true
		lastSelectedIndex = idx
		updateSampleListDisplay()
	})

	sample.children[0].addEventListener("mouseup", e => {
		if (e.button !== 0) { return }
		if (deselect) {
			if (e.ctrlKey || samples.filter(info => info.selected).length === 1) {
				sampleInfo.selected = false
				lastSelectedIndex = -1
			} else {
				for (let elem of samples) elem.selected = false
				sampleInfo.selected = true
				lastSelectedIndex = idx
			}
			updateSampleListDisplay()
			deselect = false;
		}
	})

	setSampleContextMenu(sample, idx)

	sample.children[0].addEventListener("dragstart", e => {
		e.preventDefault()
		ipcRenderer.send('ondragstart', returnSelectedPaths())
	})

	sample.children[0].children[3].addEventListener("mousedown", e => {
		e.preventDefault()
		e.stopPropagation()
	})
	sample.children[0].children[3].addEventListener("dragstart", e => {
		e.preventDefault()
		e.stopPropagation()
	})
	sample.children[0].children[3].children[1].addEventListener("mousedown", e => { e.stopPropagation() })

	sample.children[0].children[3].children[1].addEventListener("click", function(e) {
		e.preventDefault()
		e.stopPropagation()
		if (!samples[idx].buffer) { return }
		if (samples[idx].audio) {
			samples[idx].audio.stop()
		} else {
			let playbackMarker = document.createElement('div')
			playbackMarker.classList.add('playback-marker')
			this.parentNode.append(playbackMarker)

			let startPlayback = (offset) => {
				for (let elem of samples) {
					if (elem.audio) { elem.audio.stop() }
				}

				samples[idx].audio = audioCtx.createBufferSource()
				samples[idx].audio.addEventListener('ended', audioEndEventListener)
				samples[idx].audio.buffer = samples[idx].buffer
				samples[idx].audio.connect(gainNode)
				samples[idx].audio.start(0, offset)
				let startTime = audioCtx.currentTime-offset
				function movePlaybackMarker() {
					if (playbackMarker.parentNode) {
						let elapsed = audioCtx.currentTime - startTime
						let length = samples[idx].duration
						let width = playbackMarker.parentNode.children[0].offsetWidth
						playbackMarker.style.left = elapsed/length * width + 'px'
					}

					if (samples[idx].audio) {
						window.requestAnimationFrame(movePlaybackMarker)
					}
				}
				window.requestAnimationFrame(movePlaybackMarker)
				this.src = "icons/pause_circle_outline.svg"
			}

			let scrubbing = false
			function startScrubbing(e) {
				scrubbing = true
				samples[idx].audio.removeEventListener('ended', audioEndEventListener)
				samples[idx].audio.stop()
				samples[idx].audio = null
			}

			function scrub(e) {
				if (scrubbing) {
					let parentBox = playbackMarker.parentNode.children[0].getBoundingClientRect()
					playbackMarker.style.left = Math.min(parentBox.width, Math.max(0, e.clientX-parentBox.left)) + 'px'
				}
			}

			function stopScrubbing(e) {
				if (scrubbing) {
					scrubbing = false
					let parentBox = playbackMarker.parentNode.children[0].getBoundingClientRect()
					let offset = samples[idx].duration*Math.min(parentBox.width, Math.max(0, e.clientX-parentBox.left))/parentBox.width
					startPlayback(offset)
				}
			}

			let audioEndEventListener = () => {
				if (samples[idx]) {
					playbackMarker.parentNode.children[0].removeEventListener('mousedown', startScrubbing)
					window.removeEventListener('mousemove', scrub)
					window.removeEventListener('mouseup', stopScrubbing)
					playbackMarker.remove()
					samples[idx].audio = null;
					this.src = "icons/play_circle_outline.svg"
				}
			}

			playbackMarker.parentNode.children[0].addEventListener('mousedown', startScrubbing)
			window.addEventListener('mousemove', scrub)
			window.addEventListener('mouseup', stopScrubbing)

			startPlayback(0)
		}
	})

	return sample
}

function updateSample(idx) {
	let sample = document.getElementById(idx.toString())
	if (!sample) { return }

	//
	if (samples[idx].selected) {
		if (!sample.classList.contains('selected-sample')) {
			sample.classList.add('selected-sample')
		}
	} else {
		sample.classList.remove('selected-sample')
	}

	// set error message
	if (samples[idx].error) {
		if (!sample.classList.contains('decode-error')) {
			sample.classList.add('decode-error')
		}
		sample.children[3].children[3].children[1].innerHTML = samples[idx].error
	}

	// set sample length
	let duration = Math.round(samples[idx].duration)
	sample.children[3].children[2].innerHTML
		= Math.floor(duration/60).toString() + ':'
		+ ('0'+(duration%60).toString()).slice(-2)

	// set sample tags
	let tagList = sample.getElementsByClassName('tag-list')[0]
	setSampleTags(tagList, idx)

	// update context menu
	setSampleContextMenu(sample, idx)
}

function updateWaveform(idx) {
	let sample = document.getElementById(idx.toString())
	if (sample) {
		drawWaveform(sample.children[3].children[0], samples[idx].path)
	} else if (samples[idx].DOMelem) {
		drawWaveform(samples[idx].DOMelem.children[3].children[0], samples[idx].path)
	}
}

function updateSampleListDisplay() {
	const height = 13.5*remToPx+1
	// The first element on the screen
	let start = Math.min(samples.length-1, Math.floor(sampleList.scrollTop/height))
	// find first element that is below the screen
	let end = Math.min(samples.length, Math.ceil((sampleList.scrollTop+sampleList.offsetHeight)/height))

	sampleList.firstElementChild.style.height = (start*height).toString() + 'px'
	while (2 < sampleList.children.length) {
		let index = Number(sampleList.children[1].id)
		samples[index].DOMelem = sampleList.removeChild(sampleList.children[1])
	}

	for (let i = start; samples[i] && i < end; ++i) {
		if (!samples[i].decoded) {
			samples[i].decoded = true;
			ipcRenderer.send('read-file', samples[i].filePath)
		}
		if (samples[i].DOMelem) {
			sampleList.insertBefore(samples[i].DOMelem, sampleList.lastChild)
			updateSample(i)
		} else {
			sampleList.insertBefore(createSample(samples[i], i), sampleList.lastChild)
		}
	}

	sampleList.lastChild.style.height = ((samples.length-end)*height).toString() + 'px'
}

function resetSampleListDisplay() {
	const height = 13.5*remToPx+1
	// The first element on the screen
	let start = Math.min(samples.length-1, Math.floor(sampleList.scrollTop/height))
	// find first element that is below the screen
	let end = Math.min(samples.length, Math.ceil((sampleList.scrollTop+sampleList.offsetHeight)/height))

	let top = document.createElement('div')
	top.style.height = (start*height).toString() + 'px'
	top.style.visibility = 'hidden'

	sampleList.innerHTML = ""
	sampleList.appendChild(top)
	for (let i = start; samples[i] && i < end; ++i) {
		if (!samples[i].decoded) {
			samples[i].decoded = true;
			ipcRenderer.send('read-file', samples[i].filePath)
		}
		sampleList.appendChild(createSample(samples[i], i))
	}

	let bottom = document.createElement('div')
	bottom.style.height = ((samples.length-end)*height).toString() + 'px'
	bottom.style.visibility = 'hidden'
	sampleList.appendChild(bottom)
}

sampleList.addEventListener('scroll', updateSampleListDisplay)

function updateSamples() {
	let match = document.getElementById('searchbar-text').value
	for (let elem of samples) {
		if (elem.audio) { elem.audio.stop() }
	}
	samples = []
	resetSampleListDisplay()
	ipcRenderer.send('update-samples', match)
}

ipcRenderer.on('add-sample', (e, sampleInfo) => {
	if (new RegExp(document.getElementById('searchbar-text').value).source
		!== sampleInfo.match) { return }
	sampleInfo.selected = false
	sampleInfo.duration = 0
	samples.push(sampleInfo)
	updateSampleListDisplay()
})

ipcRenderer.on('file-data', (e, fileData) => {
	audioCtx.decodeAudioData(fileData.buffer.buffer).then(buffer => {
		let index
			= samples.findIndex(elem => elem.filePath === fileData.filePath)
		if (index === -1) { return }
		samples[index].buffer = buffer
		samples[index].duration = buffer.duration
		updateSample(index)
		samples[index].path = createWaveformPath(samples[index].buffer)
		updateWaveform(index)
	}).catch((err) => {
		console.log("failed to decode: \'" + fileData.filePath + "\'")
		let index
			= samples.findIndex(elem => elem.filePath === fileData.filePath)
		if (index === -1) { return }
		samples[index].error = err
		updateSample(index)
	})
})
