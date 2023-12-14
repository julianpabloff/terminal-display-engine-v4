const { PointData } = require('./utils.js');

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
	this.wrap = false;
	this.opacity = 100;
	this.pauseRenders = false;

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

	this.centerWidth = width => Math.floor(bufferWidth / 2 - width / 2);
	this.centerHeight = height => Math.floor(bufferHeight / 2 - height / 2);

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

	this.fill = color => {
		const brush = manager.processBrush(0, color, this.opacity);
		canvasCodes.fill(32);
		canvasFGs.fill(0);
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
		const point = new PointData(code, fg, bg);
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

	const move = (index, requestFunction) => {
		const localX = index % bufferWidth;
		const localY = Math.floor(index / bufferWidth);
		const eraseX = bufferX + localX;
		const eraseY = bufferY + localY;
		const drawX = pendingX + localX;
		const drawY = pendingY + localY;

		const code = currentCodes[index];
		const fg = currentFGs[index];
		const bg = currentBGs[index];

		const lookbackX = localX - (pendingX - bufferX);
		const lookbackY = localY - (pendingY - bufferY);
		const lookbackIndex = coordinateIndex(lookbackX, lookbackY);
		let differentContent = false;

		if (lookbackIndex != null) {
			const lookbackCode = currentCodes[lookbackIndex];
			const lookbackFg = currentFGs[lookbackIndex];
			const lookbackBg = currentBGs[lookbackIndex];
			differentContent = code != lookbackCode || fg != lookbackFg || bg != lookbackBg;
			if (differentContent) {
				const point = new PointData(lookbackCode, lookbackFg, lookbackBg);
				requestFunction(bufferId, point, eraseX, eraseY, bufferZ);
			}
		}

		const noEraseOverlapX = eraseX < pendingX || eraseX > pendingX + bufferWidth - 1;
		const noEraseOverlapY = eraseY < pendingY || eraseY > pendingY + bufferHeight - 1;
		if (noEraseOverlapX || noEraseOverlapY)
			requestFunction(bufferId, new PointData(), eraseX, eraseY, bufferZ);

		const noDrawOverlapX = drawX < bufferX || drawX > bufferX + bufferWidth - 1;
		const noDrawOverlapY = drawY < bufferY || drawY > bufferY + bufferHeight - 1;
		if (noDrawOverlapX || noDrawOverlapY) {
			const point = new PointData(code, fg, bg);
			requestFunction(bufferId, point, drawX, drawY, bufferZ);
		}
	}

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
	let pendingX = bufferX;
	let pendingY = bufferY;

	this.render = () => handleRender(render);
	this.paint = () => handleRender(paint);
	this.ghostRender = () => {
		if (!movePending) handleRender(render, true);
		else { // Execute the ghost move and then paint the canvas as well
			handleRender(move, true);
			this.x = bufferX = pendingX;
			this.y = bufferY = pendingY;
			handleRender(paint, true);
			movePending = false;
			return;
		}
	}
	this.move = (newX, newY) => {
		pendingX = newX;
		pendingY = newY;
		handleRender(move);
	}
	this.quietMove = (newX, newY) => {
		pendingX = newX;
		pendingY = newY;
		movePending = true;
	}

	/* TODO:
		[x] this.move(screenX, screenY);
		[x] this.quietMove(screenX, screenY);
		[ ] this.setZIndex(zIndex); ehh, when are you really gonna change the zIndex?
		    - change the construction SLL order and determine output
	*/
}

module.exports = TextDisplayBuffer;
