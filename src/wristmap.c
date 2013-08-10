#include "pebble_os.h"
#include "pebble_app.h"
#include "pebble_fonts.h"

// 0fba6c1016ac40939abd8a1731c0d85a
#define MY_UUID { 0x0F, 0xBA, 0x6C, 0x10, 0x16, 0xAC, 0x40, 0x93, 0x9A, 0xBD, 0x8A, 0x17, 0x31, 0xC0, 0xD8, 0x5A }
PBL_APP_INFO(MY_UUID,
             "Wristmap", "natevw",
             1, 0, /* App version */
             DEFAULT_MENU_ICON,
             APP_INFO_STANDARD_APP);

enum {
  MAP_KEY_IMG,
};


Window window;
BitmapLayer map;
GBitmap img;
uint8_t imgData[3360] = {0};        // 144x168 with rows padded to 32-bit word, 20*168 = 3360 bytes


void handle_init(AppContextRef ctx) {
    //resource_init_current_app(&APP_RESOURCES);
    window_init(&window, "Window Name");
    window_stack_push(&window, true /* Animated */);
    
    int16_t w = 144;    //window.layer.frame.size.w;
    int16_t h = 168;    //window.layer.frame.size.h;
    img = (GBitmap) {
        .addr = imgData,
        .bounds = GRect(0,0,w,h),
        .info_flags = 1,
        .row_size_bytes = 20,
    };
    bitmap_layer_init(&map, GRect(0,0,w,h));
    bitmap_layer_set_bitmap(&map, &img);
    layer_add_child(&window.layer, (Layer*)&map.layer);
}

void message_rx(DictionaryIterator* msg, void* context) {
    Tuple* img = dict_find(msg, MAP_KEY_IMG);
    if (img) {
        //memcpy(imgData, img->value->data, img->length);
        memset(imgData, img->value->data[0], 3360);
        layer_mark_dirty((Layer*)&map.layer);
    }
}

void pbl_main(void *params) {
    PebbleAppHandlers handlers = {
        .init_handler = &handle_init,
        .messaging_info = {
            .buffer_sizes = {
                .inbound = 124, 
                .outbound = 636, // outbound buffer size in bytes
            },
            .default_callbacks.callbacks = {
                .in_received = message_rx,
            }
        },
    };
    app_event_loop(params, &handlers);
}
