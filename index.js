/**
 * Debugging
 */
//window.addEventListener('mousedown', e => {console.log(e.target)})

/**
 * index.js
 */


const sidebar = document.getElementById('sidebar')
const mainPanel = document.getElementById('main-panel')

const drag = document.getElementById('drag')

let resizing = false;

drag.addEventListener('mousedown', e => { resizing = true })

window.addEventListener('mousemove', e => {
	if (resizing) {
		const compactWidth = remToPx(3);
		const size = Math.min(Math.max(e.clientX, remToPx(15)), window.innerWidth-remToPx(16));
		if (e.clientX < compactWidth) {
			sidebar.setAttribute('compact', "true")
			size = compactWidth;
		} else {
			sidebar.setAttribute('compact', "false")
		}

		sidebar.style.width = size+'px'
		mainPanel.style.left = size+'px'
		drag.style.left = size+'px'
	}
})


window.addEventListener('mouseup', e => { resizing = false })

const searchBar = document.getElementById('searchbar-text');
searchBar.addEventListener('input', updateSamples);
document.getElementById('delete-icon').addEventListener("click", () => {
	searchBar.value = ""
	updateSamples()
})

const categoryTemplate = document.getElementById('template-category')
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
			// Check if the category already exists
			if ([...categoryList.children].some(
				elem => elem !== e.target && elem.innerHTML === e.target.value)
			) {
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

const addCategoryBtn = document.getElementById('add-category')
addCategoryBtn.addEventListener('click', (e) => {
	createEmptyCategoryElement()
	e.stopPropagation()
})

const categoryList = document.getElementById('categories')
Object.freeze(categoryTemplate)
function createCategoryElement(categoryName) {
	const category = categoryTemplate.content.cloneNode(true)
	category.children[0].innerHTML = categoryName

	category.children[0].addEventListener("click", function(){
		if (this.id === "selected-category") {
			this.id = ""
			return
		}

		for (const elem of categoryList.children) { elem.id = "" }
		this.id = "selected-category"
	})

	const sampleMenu = Menu.buildFromTemplate([{
		label: "remove category",
		click() {
			[...categoryList.children].find(elem => elem.innerHTML === categoryName).remove()
			ipcRenderer.send('removeCategory', categoryName)
		}
	}])

	category.children[0].addEventListener('contextmenu', (e) => {
		sampleMenu.popup({ window: remote.getCurrentWindow() })
		e.preventDefault()
		e.stopPropagation()
	})
	categoryList.insertBefore(category, addCategoryBtn)
}

ipcRenderer.once('categories', (event, categories) => {
	for (const category of categories) { createCategoryElement(category) }
})
ipcRenderer.send('getCategories')

const tagList = document.getElementById('tags')
const tagTemplate = document.getElementById('template-tag')
Object.freeze(tagTemplate)
function createTagElement(tagName) {
	const tag = tagTemplate.content.cloneNode(true)
	tag.children[0].innerHTML = tagName

	tag.children[0].addEventListener("click", function(){
		if (this.classList.contains("selected-tag")) this.classList.remove("selected-tag")
		else this.classList.add("selected-tag")
	})
	tagList.appendChild(tag)
}

createTagElement("Dark")
createTagElement("Darker")
createTagElement("Darkest")
createTagElement("Darkerest")
createTagElement("for debug purposes")

const settings = document.getElementById('settings')
const settingsIcon = document.getElementById('settings-icon')
const closeSettingsBtn = document.getElementById('close-settings')
closeSettingsBtn.addEventListener('click', () => {
	settings.style.display = "none";
})
settingsIcon.addEventListener('click', () => {
	settings.style.display = "block";
})

let gainSliderMoving = false;

const gainSlider = document.getElementById('gain-slider')
const gainSliderThumb = document.getElementById('gain-slider-thumb')
const gainSliderTrail = document.getElementById('gain-slider-trail')

gainSlider.addEventListener('mousedown', e => { gainSliderMoving = true })

window.addEventListener('mousemove', e => {
	if (gainSliderMoving) {
		const boundingBox = gainSlider.getBoundingClientRect()
		const dx = Math.min(Math.max(e.clientX-boundingBox.left, 0), boundingBox.width);
		gainSliderThumb.style.left = dx + 'px'
		gainSliderTrail.style.width = dx + 'px'
		const gain = 12*4*(dx/boundingBox.width-0.75)
		gainNode.gain.value = Math.pow(10, gain/20)
	}
})

window.addEventListener('mouseup', e => { gainSliderMoving = false })
