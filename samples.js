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
	const channelHeight = 7.0*remToPx/audioBuffer.numberOfChannels
	const stepSize = 1920/audioBuffer.length

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
				click() {
					samples[idx].tags.splice(samples[idx].tags.indexOf(tag), 1)
					Array.from(tagList.children).find(elem => elem.innerHTML === tag).remove()
				}
			})
		)

		tagElem.children[0].addEventListener("mousedown", function(e) {
			e.preventDefault()
			e.stopPropagation()
		})

		tagElem.children[0].addEventListener("mouseup", function(e) {
			e.preventDefault()
			e.stopPropagation()
		})

		tagElem.children[0].addEventListener('contextmenu', function(e) {
			sampleMenu.popup({ window: remote.getCurrentWindow() })
			e.preventDefault()
			e.stopPropagation()
		})

		tagList.appendChild(tagElem)
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

	let deselect = false
	sample.children[0].addEventListener("mousedown", function(e) {
		deselect = false

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

	sample.children[0].addEventListener("mouseup", function(e) {
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
		}
	})

	sample.children[0].ondragstart = function(event) {
		event.preventDefault()
		ipcRenderer.send('ondragstart', returnSelectedPaths())
	}

	sample.children[0].children[3].children[1].addEventListener("mousedown", (e) => {
		e.preventDefault()
		e.stopPropagation()
	})

	sample.children[0].children[3].children[1].addEventListener("mouseup", (e) => {
		e.preventDefault()
		e.stopPropagation()
	})

	sample.children[0].children[3].children[1].addEventListener("click", function(e) {
		e.preventDefault()
		e.stopPropagation()
		if (!samples[idx].buffer) { return }
		if (samples[idx].audio) {
			samples[idx].audio.stop()
		} else {
			for (let elem of samples) {
				if (elem.audio) {
					elem.audio.stop()
				}
			}

			samples[idx].audio = audioCtx.createBufferSource()
			samples[idx].audio.addEventListener('ended', () => {
				if (samples[idx]) {
					samples[idx].audio = null;
					let sampleElement = document.getElementById(idx.toString())
					if (sampleElement) {
						sampleElement.children[3].children[1].src = "icons/play_circle_outline.svg"
					}
				}
			})
			samples[idx].audio.buffer = samples[idx].buffer
			samples[idx].audio.connect(gainNode)
			samples[idx].audio.start()
			this.src = "icons/pause_circle_outline.svg"
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

	sampleList.firstElementChild.style.height = (start*(13.5*remToPx+1)).toString() + 'px'
	while (2 < sampleList.children.length) {
		let index = Number(sampleList.children[1].id)
		if (samples[index] && samples[index].filePath === sampleList.children[1].children[1].innerHTML) {
			samples[index].DOMelem = sampleList.removeChild(sampleList.children[1])
		} else {
			sampleList.children[1].remove()
		}
	}

	for (let i = start; samples[i] && i < end; ++i) {
		if (!samples[i].decoded) {
			samples[i].decoded = true;
			ipcRenderer.send('read-file', samples[i].filePath)
		}
		if (!samples[i].DOMelem) {
			sampleList.insertBefore(createSample(samples[i], i), sampleList.lastChild)
		} else {
			sampleList.insertBefore(samples[i].DOMelem, sampleList.lastChild)
			updateSample(i)
		}
	}

	sampleList.lastChild.style.height = ((samples.length-end)*(13.5*remToPx+1)).toString() + 'px'
}

function resetSampleListDisplay() {
	const height = 13.5*remToPx+1
	// The first element on the screen
	let start = Math.min(samples.length-1, Math.floor(sampleList.scrollTop/height))
	// find first element that is below the screen
	let end = Math.min(samples.length, Math.ceil((sampleList.scrollTop+sampleList.offsetHeight)/height))

	let top = document.createElement('div')
	top.style.height = (start*(13.5*remToPx+1)).toString() + 'px'
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
	bottom.style.height = ((samples.length-end)*(13.5*remToPx+1)).toString() + 'px'
	bottom.style.visibility = 'hidden'
	sampleList.appendChild(bottom)
}

sampleList.addEventListener('scroll', updateSampleListDisplay)

function updateSamples() {
	let match = document.getElementById('searchbar-text').value
	for (let elem of samples) {
		if (elem.audio) {
			elem.audio.stop()
		}
	}
	samples = []
	resetSampleListDisplay()
	ipcRenderer.send('update-samples', match)
}

ipcRenderer.on('add-sample', (e, sampleInfo) => {
	if (new RegExp(document.getElementById('searchbar-text').value).source !== sampleInfo.match) {
		return
	}

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
