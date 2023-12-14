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

	this.wrap = false;
	this.opacity = 100;

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

	// Send null to tell manager to remove buffer from construction
	const sendDrawRequest = (index, code, fg, bg) => {
		const screenX = bufferX + index % bufferWidth;
		const screenY = bufferY + Math.floor(index / bufferWidth);
		const point = code ? manager.point(code, fg, bg) : null;
		manager.requestDraw(bufferId, point, screenX, screenY, bufferZ);
	}

	const render = index => {
		const code = canvasCodes[index];
		const fg = canvasFGs[index];
		const bg = canvasBGs[index];
		const currentCode = currentCodes[index];
		const currentFg = currentFGs[index];
		const currentBg = currentBGs[index];
		transferToCurrent(index, code, fg, bg);

		if (code != currentCode || fg != currentFg || bg != currentBg)
			sendDrawRequest(index, code, fg, bg);
	}

	// TODO: test this
	const paint = index => {
		const currentCode = currentCodes[index];
		const currentFg = currentFGs[index];
		const currentBg = currentBGs[index];
		const code = canvasCodes[index] || currentCode;
		const fg = canvasFGs[index] || currentFg;
		const bg = canvasBGs[index] || currentBg;
		transferToCurrent(index, code, fg, bg);

		if (code != currentCode || fg != currentFg || bg != currentBg)
			sendDrawRequest(index, code, fg, bg);
	}

	const handleRender = renderFunction => {
		let i = 0;
		do { // Loop through buffer
			renderFunction(i);
			i++;
		} while (i < bufferSize);
		manager.executeRender();
	}

	this.render = () => handleRender(render);
	this.paint = () => handleRender(paint);

}

module.exports = TextDisplayBuffer;
