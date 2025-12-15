"use strict";

const mutex = require('./build/Release/file-mutex.node');

export class StaleContext extends Error {
  constructor() {
    super('stale context');
  }
}

export class FileMutex
{
  constructor(path) {
    this.path = path;
  }

  hardLock() {
    try {
      this.handle = mutex.openFile(this.path);
      mutex.lockFile(this.handle, true);
      const time = mutex.getFileTime(this.handle);
      if (this.time && this.time !== time) {
        throw new StaleContext();
      }
      this.time = new Date().getTime();
      mutex.setFileTime(this.handle, this.time);
    } catch (e) {
      if (this.handle) {
        mutex.closeFile(this.handle);
        this.handle = null;
      }
      throw e;
    }
  }

  softLock() {
    try {
      this.handle = mutex.openFile(this.path);
      mutex.lockFile(this.handle, false);
      this.time = mutex.getFileTime(this.handle);
    } catch (e) {
      if (this.handle) {
        mutex.closeFile(this.handle);
        this.handle = null;
      }
      throw e;
    }
  }

  freeLock() {
    if (this.handle) {
      try {
        mutex.unlockFile(this.handle);
      } finally {
        mutex.closeFile(this.handle);
        this.handle = null;
      }
    }
  }

  testTime() {
    try {
      this.handle = mutex.openFile(this.path);
      mutex.lockFile(this.handle, false);
      return this.time === mutex.getFileTime(this.handle);
    } finally {
      if (this.handle) {
        mutex.closeFile(this.handle);
        this.handle = null;
      }
    }
  }
}
