const { Pixel } = require('./utils.js');

const PixelDisplayBuffer = function(manager, x, y, width, height, zIndex) {
	// Private variables for internal reference
	let bufferX = x;
	let bufferY = y;
	let bufferZ = zIndex;
	const bufferWidth = width;
	const bufferHeight = height;
	const bufferSize = width * height;

	this.x = bufferX;
	this.y = bufferY;
	this.zIndex = bufferZ;
	this.width = bufferWidth;
	this.height = bufferHeight;
	this.size = bufferSize;
	this.type = 'pixel';

	let bufferId; // get assigned by manager after creation
	this.assignId = id => bufferId = id;

	// In-application configuration
	this.wrap = false;
	this.opacity = 100;
	this.pauseRenders = false;

	const canvas = new Uint32Array(bufferSize);
	const current = new Uint32Array(bufferSize);

	// For when the manager clears the screen
	this.clearCurrent = () => current.fill(0);

	// Writing to canvas
	const coordinateIndex = (x, y) => {
		if (x < 0 || y < 0 || x >= bufferWidth || y >= bufferHeight) return null;
		return (y * bufferWidth) + x;
	}

	let cursorIndex = 0;
	this.cursorTo = (x, y) => {
		const index = coordinateIndex(x, y);
		if (index != null) cursorIndex = index;
		return this;
	}

	this.centerWidth = width => Math.floor(bufferWidth / 2 - width / 2);
	this.centerHeight = height => Math.floor(bufferHeight / 2 - height / 2);

	// this.write(color);
	// this.write(color, count);
	// this.write(colorArray);
	this.write = (colorInput, count = 1) => {
		let getColor, amount;
		const limit = this.wrap ?
			bufferSize - cursorIndex :
			bufferWidth - cursorIndex % bufferWidth;

		if (typeof colorInput == 'number') {
			const { fg } = manager.processBrush(colorInput, 0, this.opacity);
			getColor = () => fg;
			amount = Math.min(count, limit);
		} else {
			getColor = () => manager.processBrush(colorInput[i], 0, this.opacity).fg;
			amount = Math.min(colorInput.length, limit);
		}

		let i = 0;
		do { // Add to canvas from cursorIndex <amount> times
			canvas[cursorIndex + i] = getColor(); i++;
		} while (i < amount);
		cursorIndex = (cursorIndex + amount) % bufferSize;
		return this;
	}

	// this.draw(color, x, y);
	// this.draw(color, count, x, y);
	// this.draw(colorArray, x, y);
	this.draw = function(colorInput) {
		let getColor, amount;
		const argAmount = arguments.length;
		const x = arguments[argAmount - 2];
		const y = arguments[argAmount - 1];

		if (typeof colorInput == 'number') {
			const { fg } = manager.processBrush(colorInput, 0, this.opacity);
			getColor = () => fg;
			amount = 1 + (arguments[1] - 1) * (argAmount == 4);
		} else {
			getColor = () => manager.processBrush(colorInput[i], 0, this.opacity).fg;
			amount = colorInput.length;
		}

		let i = 0;
		do { // Add to canvas <amount> times
			const index = coordinateIndex(x + i, y);
			if (index != null) canvas[index] = getColor();
			i++;
		} while (i < amount);
		return this;
	}

	this.drawAbsolute = function(colorInput) {
		const argAmount = arguments.length;
		arguments[argAmount - 2] -= bufferX;
		arguments[argAmount - 1] -= bufferY;
		return this.draw(...arguments);
	}

	this.fill = color => {
		const { fg } = manager.processBrush(color, color, this.opacity);
		canvas.fill(fg);
		return this;
	}

	// Rendering
	const transferToCurrent = (top, bottom, topIndex, botIndex) => {
		canvas[topIndex] = canvas[botIndex] = 0;
		current[topIndex] = top;
		current[botIndex] = bottom;
	}

	const sendDrawRequest = (top, bottom, botIndex, requestFunction) => {
		const x = botIndex % bufferWidth;
		const y = Math.floor(botIndex / bufferWidth) - 1;
		const screenX = bufferX + x;
		const screenY = Math.floor((bufferY + y) / 2);
		const pixel = new Pixel(top, bottom);
		requestFunction(bufferId, pixel, screenX, screenY, bufferZ);
	}

	const render = topIndex => {
		const botIndex = topIndex + bufferWidth;
		const top = canvas[topIndex];
		const bottom = canvas[botIndex];
		const currentTop = current[topIndex];
		const currentBottom = current[botIndex];
		transferToCurrent(top, bottom, topIndex, botIndex);

		if (top != currentTop || bottom != currentBottom)
			sendDrawRequest(top, bottom, botIndex, manager.requestDraw);
	}

	const paint = topIndex => {
		const botIndex = topIndex + bufferWidth;
		const currentTop = current[topIndex] | 0;
		const currentBottom = current[botIndex] | 0;
		const top = (canvas[topIndex] || currentTop) | 0
		const bottom = (canvas[botIndex] || currentBottom) | 0;
		transferToCurrent(top, bottom, topIndex, botIndex);

		if (top != currentTop || bottom != currentBottom)
			sendDrawRequest(top, bottom, botIndex, manager.requestDraw);
	}

	const ghostRender = topIndex => {
		const botIndex = topIndex + bufferWidth;
		const top = canvas[topIndex];
		const bottom = canvas[botIndex];
		const currentTop = current[topIndex];
		const currentBottom = current[botIndex];
		transferToCurrent(top, bottom, topIndex, botIndex);

		if (top != currentTop || bottom != currentBottom)
			sendDrawRequest(top, bottom, botIndex, manager.requestGhostDraw);
	}

	const handleRender = (renderFunction, execute = true) => {
		if (manager.pauseRenders || this.pauseRenders) return;
		let i = 0 - bufferWidth * (bufferY & 1);
		do { // Loop through every other row
			let j = 0;
			do { // Loop through every column
				renderFunction(i + j);
				j++;
			} while (j < bufferWidth);
			i += bufferWidth * 2;
		} while (i < bufferSize);
		if (execute) manager.executeRender();
	}

	this.render = () => handleRender(render);
	this.paint = () => handleRender(paint);
	this.ghostRender = () => handleRender(ghostRender, false);

	/* TODO:
		[ ] this.move(screenX, screenY);
		[ ] this.quietMove(screenX, screenY);
		[ ] this.setZIndex(zIndex); ehh, when are you really gonna change the zIndex?
	*/
}

module.exports = PixelDisplayBuffer;
