const { hexDebugString, Pixel } = require('./utils.js');

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

	this.sample = (x, y) => {
		const index = coordinateIndex(x, y);
		if (index == null) return 0;
		return current[index];
	}

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
		// const screenY = Math.floor((bufferY + y) / 2);
		const screenY = (bufferY + y) / 2;
		const pixel = new Pixel(top, bottom);
		requestFunction(bufferId, pixel, screenX, screenY, bufferZ);
	}

	const render = (topIndex, requestFunction) => {
		const botIndex = topIndex + bufferWidth;
		const top = canvas[topIndex] | 0;
		const bottom = canvas[botIndex] | 0;
		const currentTop = current[topIndex] | 0;
		const currentBottom = current[botIndex] | 0;
		transferToCurrent(top, bottom, topIndex, botIndex);

		if (top != currentTop || bottom != currentBottom)
			sendDrawRequest(top, bottom, botIndex, requestFunction);
	}

	const paint = (topIndex, requestFunction) => {
		const botIndex = topIndex + bufferWidth;
		const currentTop = current[topIndex] | 0;
		const currentBottom = current[botIndex] | 0;
		const top = (canvas[topIndex] || currentTop) | 0
		const bottom = (canvas[botIndex] || currentBottom) | 0;
		transferToCurrent(top, bottom, topIndex, botIndex);

		if (top != currentTop || bottom != currentBottom)
			sendDrawRequest(top, bottom, botIndex, requestFunction);
	}

	let newBufferX, newBufferY;
	/*
		This whole fucking algorithm doesn't work, due, fundementally, to the method of iteration.
		I am trying to iterate two pixel rows at a time, but when the new buffer draw (in the new
		location) takes up more than the amount of char rows (when the buffer starts perfectly even
		with the char rows, then ends up straddling them) the thing can't be drawn fully. What, do I
		need a fucking if statement for that case? No I need to zoom way out and change how I'm
		iterating and processing the canvas information. Gah.

		If I were to iterate through each pixel on the buffer individually, I would be able to use a
		similar method to the text buffer's move method. I still have to send a request for a top and
		bottom, as a pair. Maybe I should iterate down each column instead of across each row?
	*/
	const shitMove = (topIndex, requestFunction, getTop, getBottom, screenShiftY) => {
		const botIndex = topIndex + bufferWidth;
		const top = getTop(topIndex);
		const bottom = getBottom(topIndex);
		let canvasTop = canvas[topIndex] | 0;
		let canvasBottom = canvas[botIndex] | 0;
		// transferToCurrent(canvasTop, canvasBottom, topIndex, botIndex);

		const localX = botIndex % bufferWidth;
		const localY = Math.floor(botIndex / bufferWidth) - 1;
		// const drawX = newBufferX + localX;
		const drawX = 7 + localX;
		const rowNumber = localY + 1 * (bufferY & 1);
		const drawY = Math.floor((newBufferY + rowNumber + screenShiftY) / 2);

		const lookaheadX = localX + (newBufferX - bufferX);
		const lookaheadY = localY + (newBufferY - bufferY);
		const lookaheadIndex = coordinateIndex(lookaheadX, lookaheadY);
		const lookaheadTop = canvas[lookaheadIndex];
		const lookaheadBottom = canvas[lookaheadIndex + bufferWidth];

		const eraseX = bufferX + localX;
		const eraseY = bufferY + localY;
		const noEraseOverlapX = eraseX < newBufferX || eraseX > newBufferX + bufferWidth - 1;
		const noEraseOverlapY = eraseY < newBufferY || eraseY > newBufferY + bufferHeight - 1;
		if (noEraseOverlapX || noEraseOverlapY) {
			// requestFunction(bufferId, new Pixel(), eraseX, Math.floor(eraseY / 2), bufferZ);
		}

		if (localX == 0 && localY == 0) {
			setTimeout(() => {
				console.log('\x1b[0m\n\n');
				console.log('lookaheadX:', lookaheadX);
				console.log('lookaheadY:', lookaheadY);
				console.log('drawing top:', hexDebugString(top));
				console.log('drawing bottom:', hexDebugString(bottom));
				console.log('lookaheadTop:', hexDebugString(lookaheadTop));
				console.log('lookaheadBottom:', hexDebugString(lookaheadBottom));
				console.log('eraseY', eraseY);
				console.log('screenEraseY', Math.floor(eraseY / 2));
			}, 500);
		}

		// if (top != lookaheadTop || bottom != lookaheadBottom) {
			const pixel = new Pixel(top, bottom);
			requestFunction(bufferId, pixel, drawX, drawY, bufferZ);
		// }
	}

	const getCanvas = index => canvas[index] | 0;
	const getCanvasOrCurrent = index => (canvas[index] || current[index]) | 0;

	const renderMove = (shiftY, screenShiftY, ghost) => {
		let getTop, getBottom;
		const shiftDown = () => {
			getTop = index => getCanvas(index - bufferWidth);
			getBottom = index => getCanvas(index);
		}
		const shiftUp = () => {
			getTop = index => getCanvas(index + bufferWidth);
			getBottom = index => getCanvas(index + bufferWidth * 2);
		}
		if (shiftY == 0) {
			getTop = index => getCanvas(index);
			getBottom = index => getCanvas(index + bufferWidth);
		} else if (shiftY == -1) {
			if (screenShiftY) shiftDown();
			else shiftUp();
		} else { // if (shiftY == 1) {
			if (screenShiftY) shiftUp();
			else shiftDown();
		}

		const renderFunction = (topIndex, requestFunction) =>
			move(topIndex, requestFunction, getTop, getBottom, screenShiftY);
		handleRender(renderFunction, ghost);
	}

	const handleRender = (renderFunction, ghost = false) => {
		if (manager.pauseRenders || this.pauseRenders) return;
		const requestFunction = ghost ? manager.requestGhostDraw : manager.requestDraw;
		let i = 0 - bufferWidth * (bufferY & 1);
		do { // Loop through every other row
			let j = 0;
			do { // Loop through each x coordinate
				renderFunction(i + j, requestFunction); // i + j = topIndex
				j++;
			} while (j < bufferWidth);
			i += bufferWidth * 2;
		} while (i < bufferSize);
		if (!ghost) manager.executeRender();
	}

	let movePending = false;
	this.move = (x, y) => {
		newBufferX = x;
		newBufferY = y;
		movePending = true;
		return this;
	}

	const evaluateMove = (renderFunction, moveFunction, ghost = false) => {
		if (!movePending) handleRender(renderFunction, ghost);
		else {
			const shiftY = (newBufferY - bufferY) % 2; // -1, 0, 1
			const straddling = bufferY & 1;

			/* screenShiftY determination:
				It is what shiftY is, unless the buffer shifts up and the buffer isn't straddling
				the character blocks, then screenShiftY becomes 0
				
				If the buffer is shifting up, for screenShiftY to not be 0 (but instead, -1), the buffer has
				to be on an even starting position (not straddling the char blocks). That's because the top
				half is at the top of the char block, and we then need to go up into the next char block

				If the buffer is shifting up but bufferY is odd (straddling the char blocks) then
				screenShiftY can be 0, since the bottom half (the top of the buffer) can become the
				top half in the same char block

				If the buffer is shifting down, for screenShiftY to not be 0 the buffer just has to
				be 
			*/
			const matchShiftY = (shiftY < 0 && !straddling) || (shiftY > 0 && straddling);
			const screenShiftY = shiftY * matchShiftY;

			// console.log('\x1b[0m\n\n');
			// console.log(bufferX, ',', bufferY, 'to', newBufferX, ',', newBufferY);

			moveFunction(shiftY, screenShiftY, ghost);
			// this.x = bufferX = newBufferX;
			// this.y = bufferY = newBufferY;
			movePending = false;
		}
		return this;
	}

	this.render = () => evaluateMove(render, renderMove);
	this.paint = () => evaluateMove(paint, paintMove);

	// Only gets called by manager
	this.ghostRender = () => evaluateMove(render, renderMove, true);
	this.ghostPaint = () => evaluateMove(paint, paintMove, true);

	/* TODO:
		[x] this.sample(x, y);
		[ ] this.move(screenX, screenY);
			- add renderMove and paintMove like TextDisplayBuffer
			- add ghostRender and ghostPaint
		[ ] this.setZIndex(zIndex); ehh, when are you really gonna change the zIndex?
	*/
}

module.exports = PixelDisplayBuffer;
