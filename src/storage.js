import fs from "node:fs/promises";
import path from "node:path";
import { defaultState } from "./defaults.js";

const clone = (value) => structuredClone(value);

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = clone(defaultState);
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const saved = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      this.state = {
        ...clone(defaultState),
        ...saved,
        settings: { ...defaultState.settings, ...saved.settings },
        scheduler: { ...defaultState.scheduler, ...saved.scheduler },
      };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.persist();
    }
    return this.snapshot();
  }

  snapshot() {
    return clone(this.state);
  }

  async update(mutator) {
    const next = clone(this.state);
    const result = await mutator(next);
    this.state = next;
    await this.persist();
    return result ?? this.snapshot();
  }

  async persist() {
    const body = `${JSON.stringify(this.state, null, 2)}\n`;
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.writeFile(temporaryPath, body, "utf8");
      await fs.rename(temporaryPath, this.filePath);
    });
    await this.writeQueue;
  }
}
