/**
 * Debugging
 */
//window.addEventListener("mousedown", e => {console.log(e.target)})

/**
 * index.js
 */
'use strict';
const { remote, ipcRenderer, shell } = require("electron")
const { dialog, Menu } = remote

const about = document.getElementById("about")
document.getElementById("close-about").addEventListener("click", () => {
	about.style.display = "none"
})

document.getElementById("github-link").addEventListener("click", () => {
	shell.openExternal("https://github.com/Dougal-s/Penguin")
})

const sidebar = document.getElementById("sidebar")
const mainPanel = document.getElementById("main-panel")

const drag = document.getElementById("drag")

let tagInfos = []

// Resizing sidepanel
let resizing = false

const dragTypes = {
	none: 0,
	tag: 1,
	category: 2
}
Object.freeze(dragTypes)
var dragEventType;

document.addEventListener("dragend", e => {
	dragEventType = dragTypes.none
})

drag.addEventListener("mousedown", e => { resizing = true })

window.addEventListener("mousemove", e => {
	if (resizing) {
		const compactWidth = remToPx(3);
		let size = Math.min(Math.max(e.clientX, remToPx(15)), window.innerWidth-remToPx(20));
		if (e.clientX < compactWidth) {
			sidebar.setAttribute("compact", "true")
			size = compactWidth;
		} else {
			sidebar.setAttribute("compact", "false")
		}

		sidebar.style.width = size + "px"
		mainPanel.style.left = size + "px"
		drag.style.left = size + "px"
	}
})

window.addEventListener("mouseup", e => { resizing = false })

// Categories
function validCategoryName(name) {
	// Check if the category already exists
	if ([...categoryList.children].some(elem => elem.innerHTML === name)) {
		return false
	}

	// Commas are used as separators in the database
	if (name.includes(",")) { return false }

	return true
}

const categoryTemplate = document.getElementById("template-category")
function createEmptyCategoryElement() {
	const category = categoryTemplate.content.cloneNode(true)
	category.children[0].id = "new-category"
	const name = document.createElement("input")
	name.type = "text"
	function checkForDeselect(e) {
		if (e.target !== name) {
			if (name.parentNode) { name.parentNode.remove() }
			window.removeEventListener("click", checkForDeselect)
		}
	}
	window.addEventListener("click", checkForDeselect)
	name.addEventListener("change", (e) => {
		if (e.target.value) {
			if (!validCategoryName(e.target.value)) {
				e.target.style.borderColor = "red"
				e.target.focus()
				return
			}
			createCategoryElement(e.target.value)
			ipcRenderer.send("addCategory", e.target.value)
		}
		e.target.parentNode.remove()
		window.removeEventListener("click", checkForDeselect)
	})
	category.children[0].appendChild(name)
	categoryList.insertBefore(category.children[0], addCategoryBtn).children[0].focus()
}

const addCategoryBtn = document.getElementById("add-category")
addCategoryBtn.addEventListener("click", (e) => {
	createEmptyCategoryElement()
	e.stopPropagation()
})

const categoryList = document.getElementById("categories")
Object.freeze(categoryTemplate)
function createCategoryElement(categoryName) {
	const category = categoryTemplate.content.cloneNode(true)
	category.children[0].innerHTML = categoryName

	category.children[0].addEventListener("click", function(){
		if (this.id === "selected-category") {
			this.id = ""
		} else {
			for (const elem of categoryList.children) { elem.id = "" }
			this.id = "selected-category"
		}
		filterUpdate()
	})

	category.children[0].addEventListener("dragstart", (e) => {
		dragEventType = dragTypes.category
		e.dataTransfer.setData("category", categoryName)
		e.dataTransfer.dropEffect = "copy"
	})

	const categoryMenu = Menu.buildFromTemplate([{
		label: "remove category",
		click() {
			[...categoryList.children].find(elem => elem.innerHTML === categoryName).remove()
			ipcRenderer.send("removeCategory", categoryName)
			for (const sample of samples) {
				if (sample.categories.includes(categoryName)) {
					removeCategory(sample, categoryName)
				}
			}
			updateContextMenus()
		}
	}])

	category.children[0].addEventListener("contextmenu", (e) => {
		categoryMenu.popup({ window: remote.getCurrentWindow() })
		e.preventDefault()
		e.stopPropagation()
	})
	categoryList.insertBefore(category, addCategoryBtn)
}

function getSelectedCategories() {
	const selectedCategory = document.getElementById("selected-category")
	if (selectedCategory) {
		return [selectedCategory.innerHTML]
	}
	return []
}

ipcRenderer.once("categories", (event, categories) => {
	for (const category of categories) { createCategoryElement(category) }
})
ipcRenderer.send("getCategories")

// Tags

const tagSearchBar = document.getElementById("tag-search-bar")
const addTagBtn = document.getElementById("add-tag-button")
const tagList = document.getElementById("tags")
const tagTemplate = document.getElementById("template-tag")
Object.freeze(tagTemplate)
tagSearchBar.children[0].addEventListener("input", (e) => {
	while (tagList.children.length > 1) { tagList.firstElementChild.remove() }
	for (const tag of tagInfos) {
		if (tag.name.includes(e.target.value)) { createTagElement(tag) }
	}
})

function validTagName(name) {
	// Check if the tag already exists
	if (tagInfos.some(tagInfo => tagInfo.name === name)) {
		return false
	}

	// Commas are used as separators in the database
	if (name.includes(",")) { return false }

	return true
}

function createEmptyTagElement() {
	const tag = tagTemplate.content.cloneNode(true)
	tag.children[0].id = "new-tag"
	const name = document.createElement("input")
	name.type = "text"
	function checkForDeselect(e) {
		if (e.target !== name) {
			if (name.parentNode) { name.parentNode.remove() }
			window.removeEventListener("click", checkForDeselect)
		}
	}
	window.addEventListener("click", checkForDeselect)
	name.addEventListener("input", (e) => {
		name.style.width = name.value.length + "ch"
		name.parentNode.style.width = name.value.length + "ch"
	})
	name.addEventListener("change", (e) => {
		if (e.target.value) {
			if (!validTagName(e.target.value)) {
				e.target.parentNode.classList.add("invalid-name")
				e.target.focus()
				return
			}
			tagInfos.push(Object.freeze({
				name: e.target.value,
				selected: false
			}))
			createTagElement(tagInfos[tagInfos.length-1])
			ipcRenderer.send("addTag", e.target.value)
		}
		e.target.parentNode.remove()
		window.removeEventListener("click", checkForDeselect)
	})
	tag.children[0].appendChild(name)
	tagList.insertBefore(tag.children[0], addTagBtn).children[0].focus()
}

addTagBtn.addEventListener("click", (e) => {
	createEmptyTagElement(e)
	e.stopPropagation()
})

function createTagElement(tagInfo) {
	const tag = tagTemplate.content.cloneNode(true)
	tag.children[0].innerHTML = tagInfo.name

	if (tagInfo.selected) { tag.children[0].classList.add("selected-tag") }

	tag.children[0].addEventListener("click", function(){
		tagInfo.selected = !tagInfo.selected
		if (tagInfo.selected) this.classList.add("selected-tag")
		else this.classList.remove("selected-tag")
		filterUpdate()
	})

	tag.children[0].addEventListener("dragstart", (e) => {
		dragEventType = dragTypes.tag
		e.dataTransfer.setData("tag", tagInfo.name)
		e.dataTransfer.dropEffect = "copy"
	})

	const tagMenu = Menu.buildFromTemplate([
		{
			label: "remove tag",
			click() {
				[...tagList.children].find(elem => elem.innerHTML === tagInfo.name).remove()
				ipcRenderer.send("removeTag", tagInfo.name)
				tagInfos.splice(tagInfos.indexOf(tagInfo), 1)
				for (const sample of samples) {
					if (sample.tags.includes(tagInfo.name)) {
						removeTag(sample, tagInfo.name)
					}
				}
				updateContextMenus()
			}
		}
	])

	tag.children[0].addEventListener("contextmenu", (e) => {
		tagMenu.popup({window: remote.getCurrentWindow()})
		e.preventDefault()
		e.stopPropagation()
	})

	tagList.insertBefore(tag, addTagBtn)
}

function getSelectedTags() { return tagInfos.filter(tag => tag.selected) }

ipcRenderer.once("tags", (event, tags) => {
	for (const tag of tags) {
		tagInfos.push(Object.seal({
			name: tag,
			selected: false
		}))
		createTagElement(tagInfos[tagInfos.length-1])
	}
})
ipcRenderer.send("getTags")

const settings = document.getElementById("settings")
const settingsIcon = document.getElementById("settings-icon")
const closeSettingsBtn = document.getElementById("close-settings")
closeSettingsBtn.addEventListener("click", () => {
	settings.style.display = "none";
})
settingsIcon.addEventListener("click", () => {
	settings.style.display = "block";
})

let gainSliderMoving = false;

const gainSlider = document.getElementById("gain-slider")
const gainSliderThumb = document.getElementById("gain-slider-thumb")
const gainSliderTrail = document.getElementById("gain-slider-trail")

gainSlider.addEventListener("mousedown", e => { gainSliderMoving = true })

window.addEventListener("mousemove", e => {
	if (gainSliderMoving) {
		const boundingBox = gainSlider.getBoundingClientRect()
		const dx = Math.min(Math.max(e.clientX-boundingBox.left, 0), boundingBox.width);
		gainSliderThumb.style.left = dx + "px"
		gainSliderTrail.style.width = dx + "px"
		const gain = 12*4*(dx/boundingBox.width-0.75)
		gainNode.gain.value = Math.pow(10, gain/20)
	}
})

window.addEventListener("mouseup", e => { gainSliderMoving = false })
