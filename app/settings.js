'use strict';
const sampleDirs = document.getElementById("sample-dirs")
const templateSampleDir = document.getElementById("template-sample-dir")
const addSampleDirBtn = document.getElementById("add-dir")

function getSamplePaths() {
    const paths = []
    for (const dir of sampleDirs.children)
        if (dir.children[0].value) paths.push(dir.children[0].value)
    return paths
}

function createSampleDir(path) {
    const sampleDir = templateSampleDir.content.cloneNode(true)
    sampleDir.children[0].children[0].value = path

    sampleDir.children[0].children[0].addEventListener("change", (e) => {
        e.target.classList.remove("error")
        if (e.target.value === "") {
            if (sampleDirs.children.length === 1) {
                e.target.focus()
                return
            }
            e.target.parentNode.remove()
        }

        try {
            const fs = remote.require("fs")
            const stat = fs.statSync(e.target.value)
            if (!stat.isDirectory()) {
                e.target.classList.add("error")
                e.target.focus()
                return
            }
        } catch (err) {
            e.target.classList.add("error")
            e.target.focus()
            return
        }

        ipcRenderer.sendSync("updateSampleDirs", getSamplePaths())
        updateSamples()
    })

    sampleDir.children[0].children[1].addEventListener("click", (e) => {
        e.target.parentNode.children[0].classList.remove("error")
        const newPath = dialog.showOpenDialogSync({ properties: ["openDirectory"] })
        if (!newPath) return
        e.target.parentNode.children[0].value = newPath

        ipcRenderer.sendSync("updateSampleDirs", getSamplePaths())
        updateSamples()
    })

    sampleDirs.append(sampleDir)
}

addSampleDirBtn.addEventListener("click", (e) => {
    createSampleDir("")
})

ipcRenderer.once("sampleDirectories", (event, sampleDirectories) => {
    for (const dir of sampleDirectories) { createSampleDir(dir) }
    if (sampleDirectories.length === 0) {
        createSampleDir("")
    }
   updateSamples()
})
ipcRenderer.send("getSampleDirectories")


const sampleLimitInput = document.getElementById("sample-limit")
sampleLimitInput.addEventListener("change", (e) => {
	e.target.classList.remove("remove")
	// if it is 0 or undefined
	if (!e.target.value || isNaN(e.target.value)) {
		e.target.classList.add("error")
		e.target.focus()
	}

	sampleLoadCount = Number(e.target.value)
	ipcRenderer.send("updateSampleLimit", sampleLoadCount)
})

ipcRenderer.once("sampleLimit", (e, limit) => {
	sampleLoadCount = limit
	sampleLimitInput.value = limit
})
ipcRenderer.send("getSampleLimit")
