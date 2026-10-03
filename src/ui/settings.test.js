import { describe, it, expect } from 'vitest';
import { defaultSettings, loadSettings, saveSettings } from './settings.js';
import { DEFAULT_BINDINGS, BINDINGS_VERSION } from '../input/index.js';

const storageFor = (saved) => {
  let value = JSON.stringify(saved);
  return { getItem: () => value, setItem: (_key, next) => { value = next; } };
};

describe('camera comfort settings', () => {
  it('preserves the existing view and full camera motion by default', () => {
    expect(defaultSettings()).toMatchObject({ cameraMotion: 1, fieldOfView: 72 });
  });
  it('adds comfort defaults to old settings without losing valid bindings or preferences', () => {
    const bindings = { ...DEFAULT_BINDINGS, camera: 'KeyZ' };
    const loaded = loadSettings(storageFor({ bindingsVersion: BINDINGS_VERSION, bindings, uiScale: 1.3, repeatShovel: true }));
    expect(loaded).toMatchObject({ cameraMotion: 1, fieldOfView: 72, uiScale: 1.3, repeatShovel: true });
    expect(loaded.bindings.camera).toBe('KeyZ');
  });
  it('supports a steady camera and a wider view through a save/reload', () => {
    const storage = storageFor(null);
    saveSettings(storage, { ...defaultSettings(), cameraMotion: 0, fieldOfView: 95 });
    expect(loadSettings(storage)).toMatchObject({ cameraMotion: 0, fieldOfView: 95 });
  });
  it('bounds edited comfort preferences before the camera reads them', () => {
    expect(loadSettings(storageFor({ cameraMotion: -20, fieldOfView: 1000 }))).toMatchObject({ cameraMotion: 0, fieldOfView: 95 });
    expect(loadSettings(storageFor({ cameraMotion: 20, fieldOfView: -1000 }))).toMatchObject({ cameraMotion: 1, fieldOfView: 50 });
  });
  it('falls back safely for invalid values in local storage', () => {
    for (const value of [null, 'wide', true, {}, []]) {
      expect(loadSettings(storageFor({ cameraMotion: value, fieldOfView: value }))).toMatchObject({ cameraMotion: 1, fieldOfView: 72 });
    }
  });
  it('does not write invalid numbers into persisted camera settings', () => {
    const storage = storageFor(null);
    saveSettings(storage, { ...defaultSettings(), cameraMotion: NaN, fieldOfView: Infinity });
    expect(loadSettings(storage)).toMatchObject({ cameraMotion: 1, fieldOfView: 72 });
  });
  it('leaves a new action unbound when its default key belongs to an older custom binding', () => {
    const bindings = { ...DEFAULT_BINDINGS, camera: 'KeyL', interact: 'KeyZ' };
    delete bindings.survey;
    delete bindings.cruise;
    delete bindings.attachments;
    const loaded = loadSettings(storageFor({ bindingsVersion: BINDINGS_VERSION, bindings }));
    expect(loaded.bindings).toMatchObject({ camera: 'KeyL', interact: 'KeyZ', survey: null, cruise: null });
    const keys = Object.values(loaded.bindings).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('preserves older custom Q and Z bindings when quick tools and cruise are introduced', () => {
    const bindings = { ...DEFAULT_BINDINGS, camera: 'KeyQ', interact: 'KeyZ' };
    delete bindings.attachments; delete bindings.cruise;
    const loaded = loadSettings(storageFor({ bindingsVersion: BINDINGS_VERSION, bindings }));
    expect(loaded.bindings).toMatchObject({ camera: 'KeyQ', interact: 'KeyZ', attachments: null, cruise: null });
    const keys = Object.values(loaded.bindings).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('adds the survey key to an older layout when it is free', () => {
    const bindings = { ...DEFAULT_BINDINGS };
    delete bindings.survey;
    expect(loadSettings(storageFor({ bindingsVersion: BINDINGS_VERSION, bindings })).bindings.survey).toBe('KeyL');
  });
});

describe('guidance settings', () => {
  it('shows the guide beam and Ray\'s tips by default, also for old saved settings', () => {
    expect(defaultSettings()).toMatchObject({ guideBeam: true, mentorTips: true });
    expect(loadSettings(storageFor({ bindingsVersion: BINDINGS_VERSION, bindings: { ...DEFAULT_BINDINGS } }))).toMatchObject({ guideBeam: true, mentorTips: true });
  });
  it('keeps them off once switched off', () => {
    const storage = storageFor(null);
    saveSettings(storage, { ...defaultSettings(), guideBeam: false, mentorTips: false });
    expect(loadSettings(storage)).toMatchObject({ guideBeam: false, mentorTips: false });
  });
});
