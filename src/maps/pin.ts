import type { MapPin } from './provider';

export function createPinElement(pin: MapPin): HTMLElement {
  const element = document.createElement('div');
  element.className = pin.selected ? 'pin pin-selected' : 'pin';
  element.style.setProperty('--pin-color', pin.color);
  const label = document.createElement('span');
  label.textContent = pin.label;
  element.append(label);
  return element;
}
