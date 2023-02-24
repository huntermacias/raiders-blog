import { buildLegacyTheme } from "sanity";

const props = {
	"--my-black": "#1e1f1e",
	"--my-silver": "#c0c0c0",
	"--my-white": "#dbdbe6",
	"--brand": "#2acb8c",
	"--my-red": "#831b26", 
	"--my-green": "#3bd888", 
	"--my-yellow": "#e8f489", 
};

export const myTheme = buildLegacyTheme({
	// base colors
	"--black": props["--my-black"],
	"--white": props["--my-silver"],

	"--gray": "#666",
	"--gray-base": "#666",

	"--component-bg": props["--my-black"],
	"--component-text-color": props["--my-white"],

	// brand
	"--brand-primary": props["--brand"],

	// Default Button
	"--default-button-color": "#666",
	"--default-button-primary-color": props["--brand"],
	"--default-button-success-color": props["--my-green"],
	"--default-button-warning-color": props["--my-yellow"],
	"--default-button-danger-color": props["--my-red"],

	// State
	"--state-info-color":  props["--brand"],
	"--state-success-color": props["--my-green"],
	"--state-warning-color": props["--my-yellow"],
	"--state-danger-color": props["--my-red"],

	// Navbar
	"--main-navigation-color":  props["--my-black"],
	"--main-navigation-color--inverted": props["--my-silver"],

	"--focus-color": props["--brand"],
})