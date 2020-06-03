'use strict';
const {app, BrowserWindow, ipcMain} = require("electron")
const fs = require("fs")
const path = require("path")
const sqlite3 = require('sqlite3')
const db = new sqlite3.Database(
	path.join(app.getPath("userData"), "files.sqlite3"),
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
const settingsPath = path.join(app.getPath("userData"), "settings.json")
try {
	fs.writeFileSync(settingsPath, "{}", {flag: "wx"})
} catch(error) {}
const settings = require(settingsPath)
settings.sampleDirectories = settings.sampleDirectories || []
settings.tags = settings.tags || []
settings.categories = settings.categories || []
settings.sampleLimit = settings.sampleLimit || 100

let window;
function createWindow() {
	window = new BrowserWindow({
		width: 900,
		height: 800,
		minWidth: 500,
		minHeight: 300,
		autoHideMenuBar: true,
		webPreferences: {
			nodeIntegration: true
		}
	});

	window.loadFile("index.html")
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
	fs.writeFile(settingsPath, JSON.stringify(settings, null, "\t"), (e) => {
		if (e) return console.log(e)
		console.log(`added category '${category}' to 'settings.json'`)
	})
})

ipcMain.on("removeCategory", (event, category) => {
	settings.categories.splice(settings.categories.indexOf(category), 1)
	fs.writeFile(settingsPath, JSON.stringify(settings, null, "\t"), (e) => {
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
	fs.writeFile(settingsPath, JSON.stringify(settings, null, "\t"), (e) => {
		if (e) return console.log(e)
		console.log(`added tag '${tag}' to 'settings.json'`)
	})
})

ipcMain.on("removeTag", (event, tag) => {
	settings.tags.splice(settings.tags.indexOf(tag), 1)
	fs.writeFile(settingsPath, JSON.stringify(settings, null, "\t"), (e) => {
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
	fs.writeFile(settingsPath, JSON.stringify(settings, null, "\t"), (e) => {
		if (e) return console.log(e)
		console.log(`updated sampleDirectories in 'settings.json' to [${paths}]`)
	})
	event.returnValue = "" // for if this was triggered via a sync action
})

ipcMain.once("getSampleLimit", (event) => {
	event.sender.send("sampleLimit", settings.sampleLimit)
})

ipcMain.on("updateSampleLimit", (event, limit) => {
	settings.sampleLimit = limit
	fs.writeFile(settingsPath, JSON.stringify(settings, null, "\t"), (e) => {
		if (e) return console.log(e)
		console.log(`updated sampleLimit in 'settings.json' to ${limit}`)
	})
})

function isAudioFile(fileName) {
	const fileTypes = [".aac",".aiff", ".flac", ".mp3", ".ogg", ".opus", "wav", ".wma", ".wv"]
	for (const extension of fileTypes)
		if (fileName.endsWith(extension)) return true
	return false
}

let walkCount = 0;
function walk(dir, match, walkId) {
	if (walkId !== walkCount) return
	fs.readdir(dir, (e, files) => {
		for (const file of files) {
			const filePath = path.join(dir, file)

			fs.stat(filePath, (e, stats) => {
				if (e) {
					console.log(e)
					return
				}
				if (stats.isDirectory()) {
					walk(filePath, match, walkId)
					return
				}

				if (!isAudioFile(filePath)) return

				if (match.test(path.basename(filePath))) {
					db.get(`SELECT categories, tags from files where sample_path = "${filePath}"`, async(err, row) => {
						const sampleCategories = typeof row !== "undefined" && row.categories ? row.categories.split(",") : [];
						const sampleTags = typeof row !== "undefined" && row.tags ? row.tags.split(",") : [];
						try {
							await window.send("add-sample", {
								filePath: filePath,
								categories: sampleCategories,
								tags: sampleTags
							}, match.source)
						} catch (err) {
							console.log(err)
						}
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
	fs.readFile(filePath, async(e, buffer) => {
		try {
			await event.sender.send("file-data", {
				filePath: filePath,
				buffer: buffer
			})
		} catch(err) {
			console.log(err)
		}
	})
})
