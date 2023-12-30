const { Point } = require('./utils.js');

const TextDisplayBuffer = function(manager, x, y, width, height, zIndex) {
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
	this.end = bufferWidth - 1;
	this.bottom = bufferHeight - 1;
	this.size = bufferSize;
	this.type = 'text'; // This would be for the bufferTools to use

	let bufferId; // gets assigned by manager after creation
	this.assignId = id => bufferId = id;

	// In-application configuration
	this.wrap = false; // whether this.write wraps in the buffer
	this.opacity = 100; // overall opacity on top of brush opacity
	this.pauseRenders = false; // stops all render operations
	this.persistent = false; // prevents manager.massRender from changing this buffer

	// Canvas: the array that you are drawing on that you eventually render to this buffer
	// Current: what's already been rendered on this buffer
	const canvasCodes = new Uint16Array(bufferSize);
	const canvasFGs = new Uint32Array(bufferSize);
	const canvasBGs = new Uint32Array(bufferSize);
	const currentCodes = new Uint16Array(bufferSize);
	const currentFGs = new Uint32Array(bufferSize);
	const currentBGs = new Uint32Array(bufferSize);

	// For when the manager clears the screen
	this.clearCurrent = () => {
		currentCodes.fill(0);
		currentFGs.fill(0);
		currentBGs.fill(0);
		inConstruction = false;
	}

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
		if (index == null) return { fg: 0, bg: 0 };
		return { fg: currentFGs[index], bg: currentBGs[index] };
	}

	const writeToCanvas = (index, code, brush) => {
		canvasCodes[index] = code;
		canvasFGs[index] = brush.fg;
		canvasBGs[index] = brush.bg;
	}

	this.write = (string, fg, bg) => {
		const brush = manager.processBrush(fg, bg, this.opacity);
		const amount = this.wrap ?
			Math.min(string.length, bufferSize - cursorIndex) :
			Math.min(string.length, bufferWidth - cursorIndex % bufferWidth);

		let i = 0;
		do { // Loop through string
			const index = cursorIndex + i;
			writeToCanvas(index, string.charCodeAt(i), brush);
			i++;
		} while (i < amount);
		cursorIndex = (cursorIndex + amount) % bufferSize;
		return this;
	}

	this.draw = (string, x, y, fg, bg) => {
		const brush = manager.processBrush(fg, bg, this.opacity);

		let i = 0;
		let stringLength = string.length;
		do { // Loop through string
			const index = coordinateIndex(x + i, y);
			if (index != null) writeToCanvas(index, string.charCodeAt(i), brush);
			i++;
		} while (i < stringLength);
		return this;
	}

	this.drawAbsolute = (string, screenX, screenY, fg, bg) => {
		const x = screenX - bufferX;
		const y = screenY - bufferY;
		this.draw(string, x, y, fg, bg);
		return this;
	}

	this.fill = (bg, char = ' ', fg) => {
		const brush = manager.processBrush(fg, bg, this.opacity);
		canvasCodes.fill(char.charCodeAt(0));
		canvasFGs.fill(brush.fg);
		canvasBGs.fill(brush.bg);
		return this;
	}

	// Rendering
	const transferToCurrent = (index, code, fg, bg) => {
		canvasCodes[index] = canvasFGs[index] = canvasBGs[index] = 0;
		currentCodes[index] = code;
		currentFGs[index] = fg;
		currentBGs[index] = bg;
	}

	const sendDrawRequest = (index, code, fg, bg, requestFunction) => {
		const screenX = bufferX + index % bufferWidth;
		const screenY = bufferY + Math.floor(index / bufferWidth);
		const point = new Point(code, fg, bg);
		requestFunction(bufferId, point, screenX, screenY, bufferZ);
	}

	const render = (index, requestFunction) => {
		const code = canvasCodes[index];
		const fg = canvasFGs[index];
		const bg = canvasBGs[index];
		const currentCode = currentCodes[index];
		const currentFg = currentFGs[index];
		const currentBg = currentBGs[index];
		transferToCurrent(index, code, fg, bg);

		if (code != currentCode || fg != currentFg || bg != currentBg)
			sendDrawRequest(index, code, fg, bg, requestFunction);
	}

	const paint = (index, requestFunction) => {
		const currentCode = currentCodes[index];
		const currentFg = currentFGs[index];
		const currentBg = currentBGs[index];
		const code = canvasCodes[index] || currentCode;
		const fg = canvasFGs[index] || currentFg;
		const bg = canvasBGs[index] || currentBg;
		transferToCurrent(index, code, fg, bg);

		if (code != currentCode || fg != currentFg || bg != currentBg)
			sendDrawRequest(index, code, fg, bg, requestFunction);
	}

	let newBufferX, newBufferY;
	const move = (index, requestFunction, getCode, getFg, getBg) => {
		const code = getCode();
		const fg = getFg();
		const bg = getBg();
		transferToCurrent(index, code, fg, bg);

		const localX = index % bufferWidth;
		const localY = Math.floor(index / bufferWidth);
		const eraseX = bufferX + localX;
		const eraseY = bufferY + localY;
		const drawX = newBufferX + localX;
		const drawY = newBufferY + localY;

		// Erase region just has to clear the construction
		const noEraseOverlapX = eraseX < newBufferX || eraseX > newBufferX + bufferWidth - 1;
		const noEraseOverlapY = eraseY < newBufferY || eraseY > newBufferY + bufferHeight - 1;
		if (noEraseOverlapX || noEraseOverlapY)
			requestFunction(bufferId, new Point(), eraseX, eraseY, bufferZ);

		const lookaheadX = localX + (newBufferX - bufferX);
		const lookaheadY = localY + (newBufferY - bufferY);
		const lookaheadIndex = coordinateIndex(lookaheadX, lookaheadY);
		const lookaheadCode = currentCodes[lookaheadIndex];
		const lookaheadFg = currentFGs[lookaheadIndex];
		const lookaheadBg = currentBGs[lookaheadIndex];

		if (code != lookaheadCode || fg != lookaheadFg || bg != lookaheadBg) {
			const point = new Point(code, fg, bg);
			requestFunction(bufferId, point, drawX, drawY, bufferZ);
		}
	}

	// Move function with render canvas handling
	const renderMove = (index, requestFunction) => move(
		index,
		requestFunction,
		() => canvasCodes[index],
		() => canvasFGs[index],
		() => canvasBGs[index]
	);

	// Move function with paint canvas handling
	const paintMove = (index, requestFunction) => move(
		index,
		requestFunction,
		() => canvasCodes[index] || currentCodes[index],
		() => canvasFGs[index] || currentFGs[index],
		() => canvasBGs[index] || currentBGs[index]
	);

	const handleRender = (renderFunction, ghost = false) => {
		if (manager.pauseRenders || this.pauseRenders) return;
		const requestFunction = ghost ? manager.requestGhostDraw : manager.requestDraw;
		let i = 0;
		do { // Loop through buffer
			renderFunction(i, requestFunction);
			i++;
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

	const evaluateMove = (noMove, yesMove, ghost = false) => {
		if (!movePending) handleRender(noMove, ghost);
		else {
			handleRender(yesMove, ghost);
			this.x = bufferX = newBufferX;
			this.y = bufferY = newBufferY;
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
		[x] this.move(screenX, screenY);
		[ ] this.quietMove(screenX, screenY);
		[ ] this.setZIndex(zIndex); ehh, when are you really gonna change the zIndex?
			- change the construction SLL order and determine output
		[x] quietMove should go away. There should just be a move function, then you have to call
			buffer.render(), buffer.paint(), manager.massRender(), or manager.massPaint()
	*/
}

module.exports = TextDisplayBuffer;
