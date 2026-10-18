/**
 * Window widths (px) at which the website layouts of the supplier screens have room. On expanded screens the left
 * sidebar takes 248px and the screen pads 32px per side, so a window of W px leaves W - 312px for content.
 */
/** Add Supplier: side pane (340px + 24px gap) next to a directory table that needs >= ~530px. */
export const ADD_SUPPLIER_SIDE_PANE_MIN_WIDTH = 1240;
/** Supplier Details: the 8-column table needs ~840px; narrower desktop windows get a 2-column card grid instead. */
export const SUPPLIER_TABLE_MIN_WIDTH = 1160;
export const ADD_SUPPLIER_SIDE_WIDTH = 340;
