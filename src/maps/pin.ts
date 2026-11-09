import type { MapPin } from './provider';

export function pinClass(pin: MapPin): string {
  return ['pin', pin.selected && 'pin-selected', pin.home && 'pin-home'].filter(Boolean).join(' ');
}

export function createPinElement(pin: MapPin): HTMLElement {
  const element = document.createElement('div');
  element.className = pinClass(pin);
  element.style.setProperty('--pin-color', pin.color);
  element.dataset.pinId = pin.id;
  const label = document.createElement('span');
  label.textContent = pin.label;
  element.append(label);
  return element;
}
