import fetch from 'unfetch'
import Promise from 'promise-polyfill';

const GAMEBOY_CAMERA_WIDTH = 160;
const GAMEBOY_CAMERA_HEIGHT = 144;

class WasmBoyLib {

  // Start the request to our wasm module
  constructor() {
    //TODO: Don't hardcode our module path
    this.wasmModuleRequest = fetch('../dist/wasm/index.untouched.wasm')
    .then(response => response.arrayBuffer());
    this.wasmInstance = undefined;
    this.wasmByteMemory = undefined;
    this.gameBytes = undefined;
    this.paused = false;
    this.ready = false;
  }

  // Finish request for wasm module, and fetch game
  loadGame(canvasElement, pathToGame) {
    // Getting started with wasm
    // http://webassembly.org/getting-started/js-api/
    this.ready = false;
    return new Promise((resolve, reject) => {

      // Attempt to bind and get the canvas element context
      try {
        this.canvasElement = canvasElement;
        this.canvasContext = this.canvasElement.getContext('2d');
        this.canvasContext.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.canvasImageData = this.canvasContext.createImageData(GAMEBOY_CAMERA_WIDTH, GAMEBOY_CAMERA_HEIGHT);

        // Scale the canvas
        // https://stackoverflow.com/questions/18547042/resizing-a-canvas-image-without-blurring-it
        this.canvasContext.imageSmoothingEnabled = false;
        this.canvasContext.scale(this.canvasElement.width / GAMEBOY_CAMERA_WIDTH, this.canvasElement.height / GAMEBOY_CAMERA_HEIGHT);
      } catch(error) {
        reject(error);
      }

      Promise.all([
        this._getWasmInstance(),
        this._fetchGameAsByteArray(pathToGame)
      ]).then((responses) => {
        // Responses already bound to this, simple resolve parent promise
        // Set our gamebytes
        this.gameBytes = responses[1];

        // Load the game data into actual memory
        for(let i = 0; i < 0x7FFF; i++) {
          if (this.gameBytes[i]) {
            this.wasmByteMemory[i] = this.gameBytes[i];
          }
        }

        // TODO: Don't initialize if running boot rom
        this.wasmInstance.exports.initialize();

        this.ready = true;
        resolve();
      }).catch((error) => {
        reject(error);
      });
    });
  }

  // Function to start the game
  startGame() {
    return this.resumeGame();
  }

  resumeGame() {
    if (!this.ready) {
      return false;
    }

    // Un-pause the game
    this.paused = false;

    requestAnimationFrame(() => {
      this._emulationLoop();
    });
  }

  pauseGame() {
    this.paused = true;
  }

  render() {
    // Draw the pixels
    // 160x144
    // TODO: Maybe set y back to 144?, works with 143

    // Split off our image Data
    const imageDataArray = [];

    for(let y = 0; y < GAMEBOY_CAMERA_HEIGHT - 1; y++) {
      for (let x = 0; x < GAMEBOY_CAMERA_WIDTH; x++) {

        // Wasm Memory Mapping
        const pixelIndex = 0x10000 + (y * 160) + x;
        const color = this.wasmByteMemory[pixelIndex];

        // Doing graphics using second answer on:
        // https://stackoverflow.com/questions/4899799/whats-the-best-way-to-set-a-single-pixel-in-an-html5-canvas
        // Image Data mapping
        const imageDataIndex = (x + (y * GAMEBOY_CAMERA_WIDTH)) * 4;
        let rgba = [];
        const alpha = 255;

        if (color) {
          if(color === 1) {
            rgba = [255, 255, 255, alpha];
          } else if (color === 2) {
            rgba = [211, 211, 211, alpha];
          } else if (color === 3) {
            rgba = [169, 169, 169, alpha];
          } else {
            rgba = [0, 0, 0, alpha];
          }
        } else {
          // TODO: Remove this testing code:
          rgba = [255, 0, 0, 1];
        }

        for(let i = 0; i < rgba.length; i++) {
          imageDataArray[imageDataIndex + i] = rgba[i];
        }
      }
    }

    // Add our new imageData
    for(let i = 0; i < imageDataArray.length; i++) {
      this.canvasImageData.data[i] = imageDataArray[i];
    }
    this.canvasContext.putImageData(this.canvasImageData, 0, 0);
    // drawImage to apply our canvas scale
    this.canvasContext.drawImage(this.canvasElement, 0, 0);
  }

  // Private funciton to returna promise to our wasmModule
  _getWasmInstance() {
    return new Promise((resolve, reject) => {

      if (this.wasmInstance) {
        resolve(this.wasmInstance);
      }

      // Get our wasm instance from our request
      this.wasmInstance = this.wasmModuleRequest.then((binary) => {
        WebAssembly.instantiate(binary, {}).then((instantiatedWasm) => {

          const instance = instantiatedWasm.instance;
          const module = instantiatedWasm.module;
          // Log we got the wasm module loaded
          console.log('wasmboy wasm module instance instantiated', instance);

          // Get our memory from our wasm instance
          const memory = instance.exports.memory;

          // Grow our wasm memory to what we need if not already
          console.log('Growing Memory if needed...');
          console.log('Current memory size:', memory.buffer.byteLength);
          // Gameboy has a memory size of 0xFFFF
          // + (256 * 256) bits of data for graphics another 0xFFFF
          if (memory.buffer.byteLength < 0xFFFF + 0xFFFF) {
            console.log('Growing memory...');
            memory.grow(2);
            console.log('New memory size:', memory.buffer.byteLength);
          } else {
            console.log('Not growing memory...');
          }

          this.wasmInstance = instance;
          // Will stay in sync
          this.wasmByteMemory = new Uint8Array(this.wasmInstance.exports.memory.buffer);

          resolve(this.wasmInstance);

        });
      });
    });
  }

  // Private function to fetch a game
  _fetchGameAsByteArray(pathToGame) {
    return new Promise((resolve, reject) => {
      // Load our backup file
      fetch(pathToGame)
      .then(blob => {
        return blob.arrayBuffer();
      }).then(bytes => {
        const byteArray = new Uint8Array(bytes);
        resolve(byteArray);
      });
    });
  }

  _emulationLoop() {
    // Offload as much of this as possible to WASM
    // Feeding wasm bytes is probably going to slow things down, would be nice to just place the game in wasm memory
    // And read from there

    // Update (Execute a frame)
    const response = this.wasmInstance.exports.update();

    if(response > 0) {
      // Render the display
      this.render();

      // Run another frame
      if(!this.paused) {
        requestAnimationFrame(() => {
            this._emulationLoop();
        });
      }
      return true;
    } else {
      console.log('Wasmboy Crashed!');
        console.log(`Program Counter: 0x${this.wasmInstance.exports.getProgramCounter().toString(16)}`)
        console.log(`Opcode: 0x${this.wasmByteMemory[this.wasmInstance.exports.getProgramCounter()].toString(16)}`);
    }
  }
}

export const WasmBoy = new WasmBoyLib();
