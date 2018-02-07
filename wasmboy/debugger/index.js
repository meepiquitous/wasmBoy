import { Component } from 'preact';
import { WasmBoy } from '../wasmboy';
import { NumberBaseTable } from './numberBaseTable';

export class WasmBoyDebugger extends Component {

  constructor() {
		super();
		// set our state to if we are initialized or not
		this.state = {
      cpu: {},
      ppu: {}
    };
	}

  stepOpcode(skipDebugOutput) {
    if(skipDebugOutput) {
      WasmBoy.wasmInstance.exports.emulationStep();
      return;
    }
    WasmBoy.wasmInstance.exports.emulationStep();
    WasmBoy.render();
    this.updateDebugInfo();
  }

  runNumberOfOpcodes(numberOfOpcodes, stopAtOpcode) {
    // Keep stepping until highest opcode increases
    let opcodesToRun = 2000;
    if(numberOfOpcodes) {
      opcodesToRun = numberOfOpcodes
    }
    for(let i = 0; i < opcodesToRun; i++) {
      this.stepOpcode(true);
      if(stopAtOpcode && stopAtOpcode === WasmBoy.wasmInstance.exports.getProgramCounter()) {
        i = opcodesToRun;
      }
    }
    WasmBoy.render();
    this.updateDebugInfo();
  }

  breakPoint(skipInitialStep) {
    // Set our opcode breakpoint
    const breakPoint = 0x26B;

    if(!skipInitialStep) {
      this.runNumberOfOpcodes(1, breakPoint);
    }

    if(WasmBoy.wasmInstance.exports.getProgramCounter() !== breakPoint) {
      requestAnimationFrame(() => {
        this.runNumberOfOpcodes(10000, breakPoint);
        this.breakPoint(true);
      });
    } else {
      WasmBoy.render();
      requestAnimationFrame(() => {
        this.updateDebugInfo();
        console.log('Reached Breakpoint!');
      });
    }
  }

  updateDebugInfo() {

    // Log our wasmLogs
    console.log(`Wasm Logs: 0x${WasmBoy.wasmInstance.exports.getCurrentLogValue().toString(16)} ${WasmBoy.wasmInstance.exports.getCurrentLogId()}`);

    // Create our new state object
    const state = {
      cpu: {},
      ppu: {}
    };

    // Update CPU State
    state.cpu['Program Counter'] = WasmBoy.wasmInstance.exports.getProgramCounter();
    state.cpu['Register A'] = WasmBoy.wasmInstance.exports.getRegisterA();
    state.cpu['Register F'] = WasmBoy.wasmInstance.exports.getRegisterF();
    state.cpu['Register B'] = WasmBoy.wasmInstance.exports.getRegisterB();
    state.cpu['Register C'] = WasmBoy.wasmInstance.exports.getRegisterC();
    state.cpu['Register D'] = WasmBoy.wasmInstance.exports.getRegisterD();
    state.cpu['Register E'] = WasmBoy.wasmInstance.exports.getRegisterE();
    state.cpu['Register H'] = WasmBoy.wasmInstance.exports.getRegisterH();
    state.cpu['Register L'] = WasmBoy.wasmInstance.exports.getRegisterL();
    state.cpu = Object.assign({}, state.cpu);
    console.log('Debugger CPU:', state.cpu);

    // Update PPU State
    state.ppu['Scanline Register (LY) - 0xFF44'] = WasmBoy.wasmByteMemory[0xFF44];
    state.ppu['LCD Status (STAT) - 0xFF41'] = WasmBoy.wasmByteMemory[0xFF41];
    state.ppu['LCD Control (LCDC) - 0xFF40'] = WasmBoy.wasmByteMemory[0xFF40];
    state.ppu['Scroll X - 0xFF43'] = WasmBoy.wasmByteMemory[0xFF43];
    state.ppu['Scroll Y - 0xFF42'] = WasmBoy.wasmByteMemory[0xFF42];
    state.ppu['Window X - 0xFF4B'] = WasmBoy.wasmByteMemory[0xFF4B];
    state.ppu['Window Y - 0xFF4A'] = WasmBoy.wasmByteMemory[0xFF4A];
    console.log('Debugger PPU:', state.ppu);

    // Clone our state, that it is immutable and will cause change detection
    this.setState(state);
  }



	render() {
		return (
      <div>
        <h2>Debugger:</h2>

        <button onclick={() => {this.updateDebugInfo()}}>Update Current Debug Info</button>

        <button onclick={() => {this.stepOpcode();}}>Step Opcode</button>

        <button onclick={() => {this.runNumberOfOpcodes();}}>Run Hardcoded number of opcodes loop</button>

        <button onclick={() => {this.breakPoint();}}>Run Until hardcoded breakpoint</button>

        <h3>Cpu Info:</h3>
        <NumberBaseTable object={this.state.cpu}></NumberBaseTable>

        <h3>PPU Info:</h3>
        <NumberBaseTable object={this.state.ppu}></NumberBaseTable>
      </div>
		);
	}
}