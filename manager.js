const TextDisplayBuffer = require('./buffer.js');
const PixelDisplayBuffer = require('./pixelBuffer.js');
const Construction = require('./construction.js');
const { getHex, getOpacity, checkOpacity, fadeColor } = require('./utils.js');

const BufferManager = function() {
	// Buffer creation
	const createdBuffers = [];
	const createBuffer = (text, x, y, width, height, zIndex) => {
		const buffer = text ?
			new TextDisplayBuffer(this, x, y, width, height, zIndex) :
			new PixelDisplayBuffer(this, x, y, width, height, zIndex);
		buffer.assignId(createdBuffers.length);
		createdBuffers.push(buffer);
		return buffer;
	}

	this.createTextBuffer = (x, y, w, h, z = 0) => createBuffer(true, x, y, w, h, z);
	this.createPixelBuffer = (x, y, w, h, z = 0) => createBuffer(false, x, y, w, h, z);

	// Screen information
	let screenWidth, screenHeight, screenSize;
	let screenCodes, screenFGs, screenBGs, screenConstruction;

	const setSize = () => {
		screenWidth = process.stdout.columns;
		screenHeight = process.stdout.rows;
		screenSize = screenWidth * screenHeight;
		screenCodes = new Uint16Array(screenSize);
		screenCodes.fill(32);
		screenFGs = new Uint32Array(screenSize);
		screenBGs = new Uint32Array(screenSize);
		screenConstruction = new Array(screenSize);
		let i = 0;
		do { // Create a construction for every point on the screen
			screenConstruction[i] = new Construction();
			i++;
		} while (i < screenSize);
	}
	setSize();

	// Screen dimensions
	this.screenWidth = () => screenWidth;
	this.screenHeight = () => screenHeight;
	const getScreenIndex = (x, y) => {
		if (x < 0 || x > screenWidth - 1) return null;
		if (y < 0 || y > screenHeight - 1) return null;
		return y * screenWidth + x;
	}

	// Setting the default color
	let defaultFg, defaultBg;
	this.setFg = colorCode => defaultFg = colorCode;
	this.setBg = colorCode => defaultBg = colorCode;
	this.setColor = (fgCode, bgCode) => {
		defaultFg = fgCode;
		defaultBg = bgCode;
	}
	this.resetColor = () => this.setColor(1694498815, 0); // White default
	this.resetColor();

	this.processBrush = (fg = 0, bg = 0, bufferOpacity = 100) => {
		if (!fg) fg = defaultFg;
		if (!bg) bg = defaultBg;
		if (checkOpacity(bufferOpacity) < 100) {
			fg = fadeColor(fg, bufferOpacity);
			bg = fadeColor(bg, bufferOpacity);
		}
		return { fg, bg };
	}

	// Terminal color and cursor movement strings
	const hexToRGB = hex => { return {r: hex >> 16, g: (hex >> 8) & 0xff, b: hex & 0xff} }
	const RGBToHex = (r, g, b) => (r << 16) + (g << 8) + b;
	const resetString = '\x1b[0m';
	const moveCursorString = (x, y) => `\x1b[${y + 1};${x + 1}H`;
	const fgHexToString = hex => `\x1b[38;2;${hex >> 16};${(hex >> 8) & 0xff};${hex & 0xff}m`;
	const bgHexToString = hex => `\x1b[48;2;${hex >> 16};${(hex >> 8) & 0xff};${hex & 0xff}m`;

	// Color conversion - 256 color
	const colorOptions = [0, 95, 135, 175, 215, 255];
	const greyOptions = []; // [8, 18, 28, 38 ... 238]
	for (let i = 232; i < 256; i++) greyOptions.push(8 + 10 * (i - 232));

	const hexTo256Color = hex => {
		const findClosest = (num, options) => {
			let lastDelta = num;
			let i = 0;
			do {
				const delta = Math.abs(num - options[i + 1]);
				if (delta > lastDelta) return { index: i, delta: lastDelta };
				lastDelta = delta;
				i++;
			} while (i < options.length - 1);
			return { index: i, delta: lastDelta };
		}
		const colorIndexToCode = (ri, gi = ri, bi = ri) => 16 + 36 * ri + 6 * gi + bi;

		const { r, g, b } = hexToRGB(hex);
		if (r != g || r != b) { // Color
			const rIndex = findClosest(r, colorOptions).index;
			const gIndex = findClosest(g, colorOptions).index;
			const bIndex = findClosest(b, colorOptions).index;
			return colorIndexToCode(rIndex, gIndex, bIndex);
		} else { // Greyscale
			const color = findClosest(r, colorOptions);
			const grey = findClosest(r, greyOptions);
			if (grey.delta < color.delta) return 232 + grey.index;
			else return colorIndexToCode(color.index);
		}
	}
	const fg256ToString = code => `\x1b[38;5;${code}m`;
	const bg256ToString = code => `\x1b[48;5;${code}m`;

	// Color conversion - 8 color
	const hexToHSV = hex => {
		const { r, g, b } = hexToRGB(hex);
		const rt = r / 255;
		const gt = g / 255;
		const bt = b / 255;
		const min = Math.min(rt, gt, bt);
		const max = Math.max(rt, gt, bt);
		const delta = max - min;

		let h;
		if (delta == 0) h = 0;
		else if (max == rt) h = 60 * (((gt - bt) / delta + 6) % 6);
		else if (max == gt) h = 60 * ((bt - rt) / delta + 2);
		else h = 60 * ((rt - gt) / delta + 4);
		const s = delta / max * (max != 0);
		const v = max;

		return { h, s, v };
	}
	// 1: black, 2: red, 3: green, 4: yellow, 5: blue, 6: magenta, 7: cyan, 8: white
	const hexTo8Color = hex => {
		const { h, s, v } = hexToHSV(hex);
		let color;
		if (s < 0.15) return 1 + 7 * (v > 0.6); // greyscale
		if (h < 30 || h >= 330) return 2; // red
		if (h < 90) return 4; // yellow
		if (h < 150) return 3; // green
		if (h < 210) return 7; // cyan
		if (h < 270) return 5; // blue
		return 6; // magenta
	}
	const fg8ToString = code => `\x1b[${29 + code}m`;
	const bg8ToString = code => `\x1b[${39 + code}m`;

	// Color Mode
	let colorModeNames = ['24 bit', '8 bit', '8 color'];
	const ansiColorStringFunctions = [
		{ fg: hex => fgHexToString(hex), bg: hex => bgHexToString(hex) },
		{ fg: hex => fg256ToString(hexTo256Color(hex)), bg: hex => bg256ToString(hexTo256Color(hex)) },
		{ fg: hex => fg8ToString(hexTo8Color(hex)), bg: hex => bg8ToString(hexTo8Color(hex)) }
	];

	let hexToAnsiFg, hexToAnsiBg;
	this.setColorMode = modeName => {
		const index = colorModeNames.indexOf(modeName);
		if (index == -1) return;
		const ansiFunction = ansiColorStringFunctions[index];
		hexToAnsiFg = ansiFunction.fg;
		hexToAnsiBg = ansiFunction.bg;
	}
	this.setColorMode('24 bit');

	// Terminal Data (cursor position and active color)
	let terminalX, terminalY, terminalFg, terminalBg;
	const setTerminalData = (x = null, y = null, fg = 0, bg = 0) => {
		terminalX = x; terminalY = y; terminalFg = fg; terminalBg = bg;
	}
	setTerminalData();

	// Rendering
	let currentRender = [];
	const addToCurrentRender = (charData, x, y) => {
		const { code, fg, bg } = charData;

		const fgChanged = fg != terminalFg;
		const bgChanged = bg != terminalBg;
		if (fgChanged || bgChanged) {
			let reset = !getOpacity(bg);
			if (reset) currentRender.push(resetString);
			else if (bgChanged) currentRender.push(hexToAnsiBg(getHex(bg)));
			if (fgChanged && getOpacity(fg) || fg && reset)
				currentRender.push(hexToAnsiFg(getHex(fg)));
		}

		if (x != terminalX + 1 || y != terminalY) currentRender.push(moveCursorString(x, y));
		currentRender.push(String.fromCharCode(code));
		setTerminalData(x, y, fg, bg);
	}

	const requestRender = (charData, x, y) => {
		const { code, fg, bg } = charData;
		const screenIndex = getScreenIndex(x, y);

		if (
			screenCodes[screenIndex] != code ||
			screenFGs[screenIndex] != fg ||
			screenBGs[screenIndex] != bg
		)
			addToCurrentRender(charData, x, y);

		screenCodes[screenIndex] = code;
		screenFGs[screenIndex] = fg;
		screenBGs[screenIndex] = bg;
	}

	// Render methods called by buffers
	this.requestDraw = (id, data, x, y, zIndex) => {
		const screenIndex = getScreenIndex(x, y);
		if (screenIndex == null) return;
		const construction = screenConstruction[screenIndex];
		construction.apply(id, zIndex, data);
		const output = construction.determineOutput();
		requestRender(output, x, y);
	}

	this.executeRender = () => {
		// console.log(currentRender);
		process.stdout.write(currentRender.join(''));
		currentRender = [];
	}

	// Data sent from TextDisplayBuffer and PixelDisplayBuffer
	const PointData = function(code, fg, bg) {
		this.type = 'point';
		this.code = code;
		this.fg = fg;
		this.bg = bg;
	}
	const PixelData = function(top, bottom) {
		this.type = 'pixel';
		this.top = top;
		this.bottom = bottom;
	}
	this.point = (code, fg, bg) => new PointData(code, fg, bg);
	this.pixel = (top, bottom) => new PixelData(top, bottom);

	// Initialization and exiting application
	const clearScreenString = '\x1b[0m\x1b[?25l\x1b[2J\x1b[1;1H';
	this.init = () => process.stdout.write(clearScreenString);

	this.exit = () => {
		process.stdout.cursorTo(0, screenHeight - 2);
		process.stdout.write('\x1b[?25h' + resetString);
	}
}

module.exports = BufferManager;
