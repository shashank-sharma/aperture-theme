import { mountApertureTheme } from '@shashank-sharma/aperture-theme';
import siteConfigRaw from '../aperture.config.yml?raw';
import { items } from './content/items';

const target = document.getElementById('app')!;

mountApertureTheme({ target, items, siteConfigRaw });


