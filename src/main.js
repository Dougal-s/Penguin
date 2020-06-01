'use strict';
const {app, BrowserWindow, ipcMain} = require("electron")
const fs = require("fs")
const sqlite3 = require('sqlite3')
const db = new sqlite3.Database(
	"./files.sqlite3",
	sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
	(e) => {
		if (e) { throw "failed to open sqlite3 database!: " + e }

		db.run(`
			CREATE TABLE IF NOT EXISTS files(
				sample_path TEXT PRIMARY KEY,
				categories TEXT,
				tags TEXT
			) WITHOUT ROWID
		`, () => {
			db.each(`SELECT sample_path from files`, (err, row) => {
				fs.access(row.sample_path, fs.constants.F_OK, (err) => {
					if (err) {
						db.exec(`DELETE FROM files WHERE sample_path = '${row.sample_path}'`)
					}
				})
			})
		})
	}
)

fs.writeFileSync("./settings.json", "{}", {flag: "w+"})
const settings = require("./settings.json")
settings.sampleDirectories = settings.sampleDirectories || []
settings.tags = settings.tags || []
settings.categories = settings.categories || []

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

app.on("quit", () => { db.close() })


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
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), (e) => {
		if (e) return console.log(e)
		console.log(`added category '${category}' to 'settings.json'`)
	})
})

ipcMain.on("removeCategory", (event, category) => {
	settings.categories.splice(settings.categories.indexOf(category), 1)
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), (e) => {
		if (e) return console.log(e)
		console.log(`removed category '${category}' in 'settings.json'`)
	})
	db.each("SELECT sample_path, categories FROM files", (err, row) => {
		const categories = row.categories.split(",")
		const index = categories.indexOf(category)
		if (index !== -1) {
			categories.splice(index, 1)
			db.exec(`
				UPDATE files
				SET categories = "${categories}"
				WHERE sample_path = "${row.sample_path}"
			`)
		}
	})
})

ipcMain.once("getTags", (event) => {
	event.sender.send("tags", settings.tags)
})

ipcMain.on("addTag", (event, tag) => {
	settings.tags.push(tag)
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), (e) => {
		if (e) return console.log(e)
		console.log(`added tag '${tag}' to 'settings.json'`)
	})
})

ipcMain.on("removeTag", (event, tag) => {
	settings.tags.splice(settings.tags.indexOf(tag), 1)
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), (e) => {
		if (e) return console.log(e)
		console.log(`removed tag '${tag}' in 'settings.json'`)
	})
	db.each("SELECT sample_path, tags FROM files", (err, row) => {
		const tags = row.tags.split(",")
		const index = tags.indexOf(tag)
		if (index !== -1) {
			tags.splice(index, 1)
			db.exec(`
				UPDATE files
				SET tags = "${tags}"
				WHERE sample_path = "${row.sample_path}"
			`)
		}
	})
})

ipcMain.once("getSampleDirectories", (event) => {
	event.sender.send("sampleDirectories", settings.sampleDirectories)
})

ipcMain.on("updateSampleDirs", (event, paths) => {
	settings.sampleDirectories = paths;
	fs.writeFile("settings.json", JSON.stringify(settings, null, "\t"), (e) => {
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
const path = require("path")
function walk(dir, match, walkId) {
	if (walkId !== walkCount) return
	fs.readdir(dir, (e, files) => {
		for (const file of files) {
			const filePath = path.join(dir, file)

			fs.stat(filePath, (e, stats) => {
				if (stats.isDirectory()) {
					walk(filePath, match, walkId)
					return
				}

				if (!isAudioFile(filePath)) return

				if (!match || match.test(path.basename(filePath))) {
					db.get(`SELECT categories, tags from files where sample_path = "${filePath}"`, (err, row) => {
						const sampleCategories = typeof row !== "undefined" && row.categories ? row.categories.split(",") : [];
						const sampleTags = typeof row !== "undefined" && row.tags ? row.tags.split(",") : [];
						window.send("add-sample", {
							filePath: filePath,
							categories: sampleCategories,
							tags: sampleTags,
							match: match.source
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
	db.exec(`
		INSERT INTO files (sample_path, ${updateInfo.updateTarget})
		VALUES ("${updateInfo.samplePath}", "${data}")
		ON CONFLICT(sample_path) DO UPDATE SET
			${updateInfo.updateTarget} = "${data}"
	`)
})

ipcMain.on("update-samples", (event, match) => {
	const regex = Object.freeze(new RegExp(match, "i"))
	for (const dir of settings.sampleDirectories) walk(dir, regex, ++walkCount)
})

ipcMain.on("read-file", (event, filePath) => {
	fs.readFile(filePath, (e, buffer) => {
		event.sender.send("file-data", {
			filePath: filePath,
			buffer: buffer
		})
	})
})
