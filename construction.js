const { getOpacity, hexDebugString, blurRGBA, layeredRGBA, RGBA } = require('./utils.js');

const Node = function(id, index, data) {
	this.id = id;
	this.index = index;
	this.data = data;
	this.next = null;
}

const Construction = function() {
	const start = { next: null };
	const addedIDs = new Set();
	const hasId = id => addedIDs.has(id);

	const addSorted = (id, index, data) => {
		const newNode = new Node(id, index, data);
		let runner = start;
		while (runner.next) {
			if (runner.next.id == id) { // Replace duplicate
				const temp = runner.next.next;
				runner.next = newNode;
				runner.next.next = temp;
				return;
			}
			if (index < runner.next.index) {
				const temp = runner.next;
				runner.next = newNode;
				runner.next.next = temp;
				addedIDs.add(id);
				return;
			}
			runner = runner.next;
		}
		runner.next = newNode;
		addedIDs.add(id);
	}

	const deleteById = id => {
		let runner = start;
		while (runner.next) {
			if (runner.next.id == id) {
				runner.next = runner.next.next;
				addedIDs.delete(id);
				return;
			}
			runner = runner.next;
		}
	}

	const forEach = callback => {
		let runner = start;
		while (runner.next) {
			const node = runner.next;
			callback(node.data, node.id, node.index);
			runner = node;
		}
	}

	this.apply = (id, zIndex, data) => {
		if (data) addSorted(id, zIndex, data);
		else deleteById(id);
	}

	const charOnPixelSolution = 'blur';
	const emptyRGBA = new RGBA();
	this.determineOutput = () => {
		let outputCode = 32;
		let outputFg = 0;
		let outputBg = 0;
		let fgRGBA, bgRGBA, topRGBA, botRGBA;
		fgRGBA = bgRGBA = topRGBA = botRGBA = emptyRGBA;
		/*
		const stackHeight = addedIDs.size;
		const topHalfStack = new Uint32Array(stackHeight);
		const botHalfStack = new Uint32Array(stackHeight);
		*/

		const calcBgRGBA = bg => {
			switch (charOnPixelSolution) {
				case 'blur': return layeredRGBA(new RGBA(bg), blurRGBA(topRGBA, botRGBA));
				case 'top': return layeredRGBA(new RGBA(bg), topRGBA);
				case 'bottom': return layeredRGBA(new RGBA(bg), botRGBA);
				// case 'blur' : return layerRGBA(getRGBA(bg), blurRGBA(topRGBA, botRGBA));
				// case 'top' : return layerRGBA(getRGBA(bg), topRGBA);
				// case 'bottom' : return layerRGBA(getRGBA(bg), botRGBA);
			}
		}

		// const processPoint = (point, stackIndex) => {
		const processPoint = point => {
			const { code, fg, bg } = point;
			const fgOpacity = getOpacity(fg);
			const bgOpacity = getOpacity(bg);

			bgRGBA = calcBgRGBA(bg);
			if (bgOpacity) {
				// const currentBgRGBA = getRGBA(bg);
				const currentBgRGBA = new RGBA(bg);
				if (bgOpacity > 99) { // Full opacity
					outputCode = 32;
					outputFg = 0;
					outputBg = bg;
				} else if (code == 32) // Layer background on top of foreground
					fgRGBA = layeredRGBA(currentBgRGBA, fgRGBA);
				topRGBA = layeredRGBA(currentBgRGBA, topRGBA);
				botRGBA = layeredRGBA(currentBgRGBA, botRGBA);
				// topHalfStack[stackIndex] = botHalfStack[stackIndex] = bg;
			}
			if (code != 32 && fgOpacity) {
				outputCode = code;
				// fgRGBA = layeredRGBA(getRGBA(fg), bgRGBA);
				fgRGBA = layeredRGBA(new RGBA(fg), bgRGBA);
			}
		}

		// const processPixel = (pixel, stackIndex) => {
		const processPixel = pixel => {
			const { top, bottom } = pixel;
			const topOpacity = getOpacity(top);
			const botOpacity = getOpacity(bottom);
			// topHalfStack[stackIndex] = top;
			// botHalfStack[stackIndex] = bottom;
			if (getOpacity(top) || getOpacity(bottom)) {
				outputCode = 32;
				fgRGBA = bgRGBA = emptyRGBA;
			}
			topRGBA = layeredRGBA(new RGBA(top), topRGBA);
			botRGBA = layeredRGBA(new RGBA(bottom), botRGBA);
			// topRGBA = layeredRGBA(getRGBA(top), topRGBA);
			// botRGBA = layeredRGBA(getRGBA(bottom), botRGBA);
		}

		const processHandler = { point: processPoint, pixel: processPixel };
		// let stackIndex = 0;
		forEach(data => {
			// processHandler[data.type](data, stackIndex);
			processHandler[data.type](data);
			// stackIndex++;
		});

		if (outputCode == 32) {
			// const top = setRGBA(topRGBA);
			// const bottom = setRGBA(botRGBA);
			const top = topRGBA.toCode();
			const bottom = botRGBA.toCode();
			const topBlockCode = 9600;
			const botBlockCode = 9604;
			if (top != bottom) {
				if (top) {
					outputCode = topBlockCode;
					outputFg = top;
					outputBg = bottom;
				} else if (bottom) {
					outputCode = botBlockCode;
					outputFg = bottom;
					outputBg = top;
				}
			} else outputBg = top;
		} else {
			// outputFg = setRGBA(fgRGBA);
			// outputBg = setRGBA(bgRGBA);
			outputFg = fgRGBA.toCode();
			outputBg = bgRGBA.toCode();
		}

		return { code: outputCode, fg: outputFg, bg: outputBg };
		
		/*
		const logStack = stack => {
			const stackLog = [];
			stack.forEach(color => {
				const opacity = getOpacity(color);
				stackLog.push(
					hexDebugString(color),
					getOpacity(color),
					' '.repeat(3 - (opacity > 0) - (opacity == 100))
				)
			});
			return stackLog;
		}
		debug();
		console.log('topStack ', ...logStack(topHalfStack));
		console.log('botStack ', ...logStack(botHalfStack));
		console.log('fg  ', hexDebugString(fgRGBA.toCode()), fgRGBA);
		console.log('bg  ', hexDebugString(bgRGBA.toCode()), bgRGBA);
		console.log('top ', hexDebugString(topRGBA.toCode()), topRGBA);
		console.log('bot ', hexDebugString(botRGBA.toCode()), botRGBA);
		console.log('\nevaluating as pixel', outputCode == 32);
		console.log('OUTPUT: code', outputCode, 'fg', hexDebugString(outputFg), 'bg', hexDebugString(outputBg));
		console.log();
		*/
	}


	// Debug
	/*
	const fgHexToString = hex => `\x1b[38;2;${hex >> 16};${(hex >> 8) & 0xff};${hex & 0xff}m`;
	const bgHexToString = hex => `\x1b[48;2;${hex >> 16};${(hex >> 8) & 0xff};${hex & 0xff}m`;
	const resetString = '\x1b[0m';

	const hexDebugString = color => {
		if (!color) return resetString + '[none]' + resetString;
		const hex = getHex(color);
		const ansi = fgHexToString(hex);
		const hexString = hex.toString(16);
		const filler = '0'.repeat(6 - hexString.length);
		return ansi + '#' + filler + hexString + resetString;
	}
	*/

	const debug = () => {
		console.log('CONSTRUCTION:');
		forEach((data, id, index) => {
			for (const [key, value] of Object.entries(data)) {
				const logArray = ['   ', key];
				if (key != 'code' && key != 'type')
					logArray.push(hexDebugString(value), getOpacity(value), getRGBA(value));
				else logArray.push(value);
				console.log(...logArray);
			}
			console.log();
		});
	}
}

module.exports = Construction;
