const { getOpacity, hexDebugString, blurredRGBA, layeredRGBA, RGBA } = require('./utils.js');

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
			callback(node.data);
			runner = node;
		}
	}

	this.apply = (id, zIndex, data) => {
		if (data) addSorted(id, zIndex, data);
		else deleteById(id);
	}

	this.determineOutput = () => {
		let outputCode = 32;
		let outputFg = 0;
		let outputBg = 0;
		let fgRGBA = new RGBA();
		let bgRGBA = new RGBA();
		let topRGBA = new RGBA();
		let botRGBA = new RGBA();

		const processPoint = point => {
			const { code, fg, bg } = point;
			const fgOpacity = getOpacity(fg);
			const bgOpacity = getOpacity(bg);

			if (bgOpacity) {
				const initialBgRGBA = new RGBA(bg);
				bgRGBA = layeredRGBA(initialBgRGBA, bgRGBA);
				if (bgOpacity > 99) outputCode = 32;
				else if (code == 32) fgRGBA = layeredRGBA(initialBgRGBA, fgRGBA);
				topRGBA = layeredRGBA(initialBgRGBA, topRGBA);
				botRGBA = layeredRGBA(initialBgRGBA, botRGBA);
			}
			if (code != 32 && fgOpacity) {
				outputCode = code;
				fgRGBA = layeredRGBA(new RGBA(fg), bgRGBA);
			}
		}

		const processPixel = pixel => {
			const { top, bottom } = pixel;
			topRGBA = layeredRGBA(new RGBA(top), topRGBA);
			botRGBA = layeredRGBA(new RGBA(bottom), botRGBA);
			
			if (getOpacity(top) || getOpacity(bottom)) {
				outputCode = 32;
				bgRGBA = blurredRGBA(topRGBA, botRGBA);
			}
		}

		// Loop through construction
		const processHandler = { point: processPoint, pixel: processPixel };
		forEach(data => processHandler[data.type](data));

		if (outputCode == 32) {
			const top = topRGBA.toCode();
			const bottom = botRGBA.toCode();
			if (top != bottom) {
				if (top) {
					outputCode = 9600;
					outputFg = top;
					outputBg = bottom;
				} else if (bottom) {
					outputCode = 9604;
					outputFg = bottom;
					outputBg = top;
				}
			} else outputBg = top;
		} else {
			outputFg = fgRGBA.toCode();
			outputBg = bgRGBA.toCode();
		}

		return { code: outputCode, fg: outputFg, bg: outputBg };
	}


	// Debug
	const logRGBA = rgba => {
		const { r, g, b, a } = rgba;
		return ['RGBA { r:', r, 'g:', g, 'b:', b, 'a:', a, '}'];
	}
	const debug = () => {
		console.log('CONSTRUCTION:');
		forEach((data, id, index) => {
			for (const [key, value] of Object.entries(data)) {
				const logArray = ['   ', key];
				if (key != 'code' && key != 'type')
					logArray.push(hexDebugString(value), getOpacity(value), ...logRGBA(new RGBA(value)));
				else logArray.push(value);
				console.log(...logArray);
			}
			console.log();
		});
	}
	this.determineOutputDebug = () => {
		let outputCode = 32;
		let outputFg = 0;
		let outputBg = 0;
		let fgRGBA = new RGBA();
		let bgRGBA = new RGBA();
		let topRGBA = new RGBA();
		let botRGBA = new RGBA();
		debug();

		const logResult = () => {
			console.log('\n  processing result: [ outputCode =', outputCode, ']');
			console.log('    fg    ', hexDebugString(fgRGBA.toCode()), ...logRGBA(fgRGBA));
			console.log('    bg    ', hexDebugString(bgRGBA.toCode()), ...logRGBA(bgRGBA));
			console.log('    top   ', hexDebugString(topRGBA.toCode()), ...logRGBA(topRGBA));
			console.log('    bottom', hexDebugString(botRGBA.toCode()), ...logRGBA(botRGBA));
		}

		const processPoint = point => {
			const { code, fg, bg } = point;
			const fgOpacity = getOpacity(fg);
			const bgOpacity = getOpacity(bg);
			console.log('PROCESSING point:', code, hexDebugString(fg), fgOpacity, hexDebugString(bg), bgOpacity);

			const currentFgRGBACode = fgRGBA.toCode();
			const currentBgRGBACode = bgRGBA.toCode();
			if (bgOpacity) {
				// We want to remember the pure RBGA for the background for layering it on
				// top of the fg if neccessary as well as layering it on top of the pixel RGBAs
				const initialBgRGBA = new RGBA(bg);
				bgRGBA = layeredRGBA(initialBgRGBA, bgRGBA);
				console.log('  - updating bgRGBA:', hexDebugString(bg), getOpacity(bg), 'layered on', hexDebugString(currentBgRGBACode), '-->', hexDebugString(bgRGBA.toCode()));
				if (bgOpacity > 99) {
					outputCode = 32;
					// Maybe this is unecessary (spoiler: it is. When fgRGBA is needed (see below), it is determined without needing reference to past fgRGBA)
					// fgRGBA = new RGBA();
					// console.log('  - full bg opacity, clearing fgRGBA:', hexDebugString(currentFgRGBACode), '-->', hexDebugString(0));
				} else if (code == 32) {
					console.log('  - faded bg w/ no char, layering this bg on the current fgRGBA:');
					fgRGBA = layeredRGBA(initialBgRGBA, fgRGBA);
					console.log('    - updating fgRGBA:', hexDebugString(bg), bgOpacity, 'layered on', hexDebugString(currentFgRGBACode), '-->', hexDebugString(fgRGBA.toCode()));
				}
				console.log('  - layering initialBgRGBA on top & bottom RGBAs:');
				const initialTopRGBACode = topRGBA.toCode();
				const initialBotRGBACode = botRGBA.toCode();
				topRGBA = layeredRGBA(initialBgRGBA, topRGBA);
				botRGBA = layeredRGBA(initialBgRGBA, botRGBA);
				console.log('    - updating topRGBA:', hexDebugString(bg), bgOpacity, 'layered on', hexDebugString(initialTopRGBACode), '-->', hexDebugString(topRGBA.toCode()));
				console.log('    - updating botRGBA:', hexDebugString(bg), bgOpacity, 'layered on', hexDebugString(initialBotRGBACode), '-->', hexDebugString(botRGBA.toCode()));
			}
			if (code != 32 && fgOpacity) {
				console.log('  - char present with fgOpacity, fading fg onto current bgRGBA:');
				outputCode = code;
				fgRGBA = layeredRGBA(new RGBA(fg), bgRGBA);
				console.log('    - updating fgRGBA:', hexDebugString(fg), getOpacity(fg), 'layered on', hexDebugString(bgRGBA.toCode()), '-->', hexDebugString(fgRGBA.toCode()));
			}
		}

		const processPixel = pixel => {
			const { top, bottom } = pixel;
			const topOpacity = getOpacity(top);
			const botOpacity = getOpacity(bottom);
			console.log('PROCESSING pixel:', hexDebugString(top), topOpacity, hexDebugString(bottom), botOpacity);

			const currentTopRGBACode = topRGBA.toCode();
			const currentBotRGBACode = botRGBA.toCode();
			topRGBA = layeredRGBA(new RGBA(top), topRGBA);
			botRGBA = layeredRGBA(new RGBA(bottom), botRGBA);
			console.log('  - updating topRGBA:', hexDebugString(top), topOpacity, 'layered on', hexDebugString(currentTopRGBACode), '-->', hexDebugString(topRGBA.toCode()));
			console.log('  - updating botRGBA:', hexDebugString(bottom), botOpacity, 'layered on', hexDebugString(currentBotRGBACode), '-->', hexDebugString(botRGBA.toCode()));

			if (!topOpacity && !botOpacity) return;
			console.log('  - pixel is present: clearing fgRGBA and updating bgRGBA');
			const currentBgRGBACode = bgRGBA.toCode();
			outputCode = 32;
			fgRGBA = new RGBA();
			bgRGBA = blurredRGBA(topRGBA, botRGBA);
			console.log('    - clearing fgRGBA:', ...logRGBA(fgRGBA));
			console.log('    - updating bgRGBA: blurring', hexDebugString(topRGBA.toCode()), topOpacity, 'and', hexDebugString(botRGBA.toCode()), botOpacity, 'to get', hexDebugString(bgRGBA.toCode()));
		}

		const processHandler = { point: processPoint, pixel: processPixel };
		forEach(data => {
			console.log('-----');
			processHandler[data.type](data);
			logResult();
		});

		console.log();
		if (outputCode == 32) {
			console.log('returning as PIXEL');
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
			console.log('returning as POINT');
			outputFg = fgRGBA.toCode();
			outputBg = bgRGBA.toCode();
		}
		console.log('char:', outputCode, String.fromCharCode(outputCode));
		console.log('fg:', hexDebugString(outputFg));
		console.log('bg:', hexDebugString(outputBg));

		console.log('--------------', '\n');
		return { code: outputCode, fg: outputFg, bg: outputBg };
	}
}

module.exports = Construction;
