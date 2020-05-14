/**
 * Debugging
 */
//window.addEventListener('mousedown', e => {console.log(e.target)})

/**
 * index.js
 */


let sidebar = document.getElementById('sidebar')
let mainPanel = document.getElementById('main-panel')

let drag = document.getElementById('drag')

let resizing = false;

drag.addEventListener('mousedown', e => { resizing = true })

window.addEventListener('mousemove', e => {
	if (resizing) {
		const compactWidth = 3*remToPx;
		let size = Math.min(Math.max(e.clientX, 15*remToPx), window.innerWidth-16*remToPx);
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

let searchBar = document.getElementById('searchbar-text');
searchBar.addEventListener('input', updateSamples);
document.getElementById('delete-icon').addEventListener("click", () => {
	searchBar.value = ""
	updateSamples()
})

let categoryList = document.getElementById('categories')
let categoryTemplate = document.getElementById('template-category')
function createCategoryElement(categoryName) {
	let category = categoryTemplate.content.cloneNode(true)
	category.children[0].innerHTML = categoryName

	category.children[0].addEventListener("click", function(){
		if (this.id === "selected-category") {
			this.id = ""
			return
		}

		for (let elem of categoryList.children)
			elem.id = ""

		this.id = "selected-category"
	})
	categoryList.appendChild(category)
}

createCategoryElement("Percussion")
createCategoryElement("Drums")
createCategoryElement("Screams of the dead")


let tagList = document.getElementById('tags')
let tagTemplate = document.getElementById('template-tag')
function createTagElement(tagName) {
	let tag = tagTemplate.content.cloneNode(true)
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

let settings = document.getElementById('settings')
let settingsIcon = document.getElementById('settings-icon')
let closeSettingsBtn = document.getElementById('close-settings')
closeSettingsBtn.addEventListener('click', () => {
	settings.style.display = "none";
})
settingsIcon.addEventListener('click', () => {
	settings.style.display = "block";
})

let gainSliderMoving = false;

let gainSlider = document.getElementById('gain-slider')
let gainSliderThumb = document.getElementById('gain-slider-thumb')
let gainSliderTrail = document.getElementById('gain-slider-trail')

gainSlider.addEventListener('mousedown', e => { gainSliderMoving = true })

window.addEventListener('mousemove', e => {
	if (gainSliderMoving) {
		let boundingBox = gainSlider.getBoundingClientRect()
		let dx = Math.min(Math.max(e.clientX-boundingBox.left, 0), boundingBox.width);
		gainSliderThumb.style.left = dx + 'px'
		gainSliderTrail.style.width = dx + 'px'
		let gain = 12*4*(dx/boundingBox.width-0.75)
		gainNode.gain.value = Math.pow(10, gain/20)
	}
})

window.addEventListener('mouseup', e => { gainSliderMoving = false })