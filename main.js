
const {app, BrowserWindow, ipcMain} = require('electron')
let fs = require('fs')
let path = require('path')

let settings = require('./settings.json')

let window;
function createWindow() {
	window = new BrowserWindow({
		width: 1300,
		height: 800,
		minWidth: 500,
		minHeight: 300,
		webPreferences: {
			nodeIntegration: true
		}
	});

	window.loadFile('index.html')

	window.webContents.openDevTools()
	window.removeMenu()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
	if (process.platform !== "darwin") app.quit()
})

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow()
})


ipcMain.on('ondragstart', (event, filePaths) => {
	event.sender.startDrag({
		files: filePaths,
		icon: 'icons/audio_file.png'
	});
});

ipcMain.once('getSampleDirectories', (event) => {
	event.sender.send('sampleDirectories', settings.sampleDirectories)
})

ipcMain.on('updateSampleDirs', (event, paths) => {
	settings.sampleDirectories = paths;
	fs.writeFile('settings.json', JSON.stringify(settings, null, '\t'), function(e) {
		if (e) return console.log(e)
		console.log('set sampleDirectories in \'settings.json\' to [' + paths + ']')
	})
	event.returnValue = "" // for if this was triggered via a sync action
})

function isAudioFile(fileName) {
	const fileTypes = ['.aac','.aiff', '.flac', '.mp3', '.ogg', '.opus', 'wav', '.wma', '.wv']
	for (const extension of fileTypes)
		if (fileName.endsWith(extension)) return true
	return false
}

let walkCount = 0;
function walk(dir, match, walkId) {
	if (walkId !== walkCount) return
	fs.readdir(dir, (e, files) => {
		for (let file of files) {
			let filePath = path.join(dir, file)

			fs.stat(filePath, (e, stats) => {
				if (stats.isDirectory()) {
					walk(filePath, match, walkId)
					return
				}

				if (!isAudioFile(filePath)) return

				if (!match || match.test(path.basename(filePath))) {
					window.send('add-sample', {
						filePath: filePath,
						tags: ['for debug purposes'],
						match: match.source
					})
				}
			})
		}
	})
}

ipcMain.on('update-samples', (event, match) => {
	let regex = new RegExp(match, 'i')
	for (const dir of settings.sampleDirectories) walk(dir, regex, ++walkCount)
})

ipcMain.on('read-file', (event, filePath) => {
	fs.readFile(filePath, (e, buffer) => {
		window.send('file-data', {
			filePath: filePath,
			buffer: buffer
		})
	})
})