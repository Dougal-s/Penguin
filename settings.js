sampleDirs = document.getElementById('sample-dirs')
let templateSampleDir = document.getElementById('template-sample-dir')
let addSampleDirBtn = document.getElementById('add-dir')

function createSampleDir(path) {
    let sampleDir = templateSampleDir.content.cloneNode(true)
    sampleDir.children[0].children[0].value = path

    sampleDir.children[0].children[0].addEventListener('change', (e) => {
        e.target.classList.remove('error')
        if (e.target.value === "") {
            if (sampleDirs.children.length === 1) {
                e.target.focus()
                return
            }
            e.target.parentNode.remove()
        }

        try {
            const fs = remote.require('fs')
            stat = fs.statSync(e.target.value)
            if (!stat.isDirectory()) {
                e.target.classList.add('error')
                e.target.focus()
                return
            }
        } catch (err) {
            e.target.classList.add('error')
            e.target.focus()
            return
        }

        let paths = []
        for (const dir of sampleDirs.children)
            paths.push(dir.children[0].value)
        ipcRenderer.sendSync('updateSampleDirs', paths)
        updateSamples()
    })

    sampleDir.children[0].children[1].addEventListener('click', (e) => {
        e.target.parentNode.children[0].classList.remove('error')
        let path = dialog.showOpenDialogSync({
    		properties: ['openDirectory']
    	})
        if (!path) return
        e.target.parentNode.children[0].value = path

        let paths = []
        for (const dir of sampleDirs.children)
            paths.push(dir.children[0].value)
        ipcRenderer.sendSync('updateSampleDirs', paths)
        updateSamples()
    })

    sampleDirs.append(sampleDir)
}

addSampleDirBtn.addEventListener('click', (e) => {
    createSampleDir('')
})

ipcRenderer.once('sampleDirectories', (event, sampleDirectories) => {
    for (const dir of sampleDirectories) {
        createSampleDir(dir)
    }
})
ipcRenderer.send('getSampleDirectories')
