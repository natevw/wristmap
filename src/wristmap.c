#include "pebble_os.h"
#include "pebble_app.h"
#include "pebble_fonts.h"


#define MY_UUID { 0x0F, 0xBA, 0x6C, 0x10, 0x16, 0xAC, 0x40, 0x93, 0x9A, 0xBD, 0x8A, 0x17, 0x31, 0xC0, 0xD8, 0x5A }
PBL_APP_INFO(MY_UUID,
             "Wristmap", "Synapliance",
             1, 0, /* App version */
             DEFAULT_MENU_ICON,
             APP_INFO_STANDARD_APP);

Window window;
BmpContainer tile;


void handle_init(AppContextRef ctx) {
    resource_init_current_app(&APP_RESOURCES);
    window_init(&window, "Window Name");
    window_stack_push(&window, true /* Animated */);

    bmp_init_container(RESOURCE_ID_TEST_TILE, &tile);
    layer_add_child(&window.layer, (Layer*)&tile.layer);
}


void pbl_main(void *params) {
  PebbleAppHandlers handlers = {
    .init_handler = &handle_init
  };
  app_event_loop(params, &handlers);
}
