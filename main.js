
const {app, BrowserWindow, ipcMain} = require("electron")
const fs = require("fs")
const path = require("path")
const sqlite3 = require('sqlite3')
const db = new sqlite3.Database(
	"./files.sqlite3",
	sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
	(e) => {
		if (e) {
			throw "failed to open sqlite3 database!: " + e
		}

		db.run(`
			CREATE TABLE IF NOT EXISTS files(
				sample_path TEXT PRIMARY KEY,
				categories TEXT,
				tags TEXT
			) WITHOUT ROWID
		`)
	}
)


const settings = require("./settings.json")

let window;
function createWindow() {
	window = new BrowserWindow({
		width: 1300,
		height: 800,
		minWidth: 500,
		minHeight: 300,
		icon: "penguin-development.png",
		webPreferences: {
			nodeIntegration: true
		}
	});

	window.loadFile("index.html")

	window.webContents.openDevTools()
	window.removeMenu()
}

app.whenReady().then(createWindow)

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on("quit", () => {
	db.close()
})


ipcMain.on("ondragstart", (event, filePaths) => {
	event.sender.startDrag({
		files: filePaths,
		icon: "icons/audio_file.png"
	});
});

ipcMain.once("getCategories", (event) => {
	event.sender.send("categories", settings.categories)
})

ipcMain.on("addCategory", (event, category) => {
	settings.categories.push(category)
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), function(e) {
		if (e) return console.log(e)
		console.log(`added category '${category}' to 'settings.json'`)
	})
})

ipcMain.on("removeCategory", (event, category) => {
	settings.categories.splice(settings.categories.indexOf(category), 1)
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), function(e) {
		if (e) return console.log(e)
		console.log(`removed category '${category}' in 'settings.json'`)
	})
})

ipcMain.once("getTags", (event) => {
	event.sender.send("tags", settings.tags)
})

ipcMain.on("addTag", (event, tag) => {
	settings.tags.push(tag)
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), function(e) {
		if (e) return console.log(e)
		console.log(`added tag '${tag}' to 'settings.json'`)
	})
})

ipcMain.on("removeTag", (event, tag) => {
	settings.tags.splice(settings.tags.indexOf(tag), 1)
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), function(e) {
		if (e) return console.log(e)
		console.log(`removed tag '${tag}' in 'settings.json'`)
	})
})

ipcMain.once("getSampleDirectories", (event) => {
	event.sender.send("sampleDirectories", settings.sampleDirectories)
})

ipcMain.on("updateSampleDirs", (event, paths) => {
	settings.sampleDirectories = paths;
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), function(e) {
		if (e) return console.log(e)
		console.log(`updated sampleDirectories in 'settings.json' to [${paths}]`)
	})
	event.returnValue = "" // for if this was triggered via a sync action
})

function isAudioFile(fileName) {
	const fileTypes = [".aac",".aiff", ".flac", ".mp3", ".ogg", ".opus", "wav", ".wma", ".wv"]
	for (const extension of fileTypes)
		if (fileName.endsWith(extension)) return true
	return false
}

let walkCount = 0;
function walk(dir, filter, walkId) {
	if (walkId !== walkCount) return
	fs.readdir(dir, (e, files) => {
		for (const file of files) {
			const filePath = path.join(dir, file)

			fs.stat(filePath, (e, stats) => {
				if (stats.isDirectory()) {
					walk(filePath, filter, walkId)
					return
				}

				if (!isAudioFile(filePath)) return

				if (!filter.match || filter.match.test(path.basename(filePath))) {
					db.get(`SELECT tags from files where sample_path = ${filePath}`, (err, row) => {
						const sampleCategories = row ? row.categories.split(",") : [];
						const sampleTags = row ? row.tags.split(",") : [];
						let inCategory = false
						for (const category of sampleCategories) {
							if (filter.categories.includes(category)) {
								inCategory = true
								break;
							}
						}
						if (filter.categories.length && !inCategory) { return }
						for (const tag of filter.tags) {
							if (!sampleTags.includes(tag)) { return }
						}
						window.send("add-sample", {
							filePath: filePath,
							categories: sampleCategories,
							tags: sampleTags,
							match: filter.match.source
						})
					})
				}
			})
		}
	})
}

/**
 * updateInfo fields:
 *   samplePath: path to the sample
 *   updateTarget: name of the field to update
 *   updateData: new field value
 */
ipcMain.on("update-sample-info", (event, updateInfo) => {
	const data = updateInfo.updateData.join(",")
	db.run(`
		INSERT INTO files (sample_path, ${updateInfo.updateTarget})
		VALUES
			(${updateInfo.samplePath}, ${data})
		ON DUPLICATE KEY
		UPDATE files SET ${updateInfo.updateTarget} = ${data}
		WHERE sample_path = ${updateInfo.samplePath}
	`)
})

ipcMain.on("update-samples", (event, match, tags, categories) => {
	const filter = Object.freeze({
		match: new RegExp(match, "i"),
		categories: categories,
		tags: tags
	})
	for (const dir of settings.sampleDirectories) walk(dir, filter, ++walkCount)
})

ipcMain.on("read-file", (event, filePath) => {
	fs.readFile(filePath, (e, buffer) => {
		event.sender.send("file-data", {
			filePath: filePath,
			buffer: buffer
		})
	})
})
