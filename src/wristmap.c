#include "pebble_os.h"
#include "pebble_app.h"
#include "pebble_fonts.h"
#include "http.h"

// 0fba6c1016ac40939abd8a1731c0d85a
#define MY_UUID { 0x0F, 0xBA, 0x6C, 0x10, 0x16, 0xAC, 0x40, 0x93, 0x9A, 0xBD, 0x8A, 0x17, 0x31, 0xC0, 0xD8, 0x5A }
PBL_APP_INFO(HTTP_UUID,
             "Wristmap", "natevw",
             1, 0, /* App version */
             DEFAULT_MENU_ICON,
             APP_INFO_STANDARD_APP);

enum {
    MAP_KEY_ULAT,
    MAP_KEY_ULON,
    MAP_KEY_ZOOM,
    MAP_KEY_ROW
};

#define MIN_ZOOM 0
#define MAX_ZOOM 18

AppContextRef app;
Window window;
BitmapLayer map;
GBitmap img;
uint8_t imgData[3360] = {0};        // 144x168 with rows padded to 32-bit word, 20*168 = 3360 bytes

AppTimerHandle locTimer = APP_TIMER_INVALID_HANDLE;
int32_t ulat, ulon;
uint8_t zoom = 12;
uint8_t rowN = 0;

void reschedule_locTimer() {
    if (locTimer) app_timer_cancel_event(app, locTimer);
    // schedule the next update based on zoom level
    uint32_t poll;
    if (zoom < 5) {
        poll = 600e3;
    } else if (zoom < 10) {
        poll = 60e3;
    } else if (zoom < 14) {
        poll = 5e3;
    } else {
        poll = 1e3;
    }
    locTimer = app_timer_send_event(app, poll, 0);
}

void request_location() {
    http_location_request();
}

void next_rows() {
    DictionaryIterator* req;
	http_out_get("http://wristmap.argyl.es/api/v1", rowN, &req);
    dict_write_int32(req, MAP_KEY_ULAT, ulat);
	dict_write_int32(req, MAP_KEY_ULON, ulon);
    dict_write_int32(req, MAP_KEY_ZOOM, zoom);
    dict_write_int32(req, MAP_KEY_ROW, rowN);
    http_out_send();
}

void reload_map() {
    // HACK: this will result in more consistently fast requests, but poor battery life.
    //       see https://github.com/pebble/pebblekit/issues/31#issuecomment-20963734
    app_comm_set_sniff_interval(SNIFF_INTERVAL_REDUCED);
    app_comm_set_sniff_interval(SNIFF_INTERVAL_NORMAL);
    
    // invert existing map to let user know it is stale
    for (unsigned i=0; i < 20*rowN; i += 1) imgData[i] ^= 0xFF;
    for (unsigned i=20*rowN; i < sizeof(imgData); i += 1) imgData[i] = 0;
    layer_mark_dirty((Layer*)&map.layer);
    
    rowN = 0;
    next_rows();
}

void change_zoom(ClickRecognizerRef rec, void* ctx) {
    bool up = (uintptr_t)ctx;
    if (up && zoom > MIN_ZOOM) zoom -= 1;
    else if (zoom <  MAX_ZOOM) zoom += 1;
    reload_map();
    reschedule_locTimer();
}

void trigger_location(ClickRecognizerRef rec, void* ctx) {
    request_location();
}

void rcv_location(float lat, float lon, float alt, float acc, void* ctx) {
    ulat = lat * 1e6;
    ulon = lon * 1e6;
    APP_LOG(APP_LOG_LEVEL_INFO, "Got location %i, %i +/- %i, malt=%i", ulat, ulon, acc, alt*1e3);
    reload_map();
}

void rcv_resp(int32_t tok, int code, DictionaryIterator* res, void* ctx) {
    if (tok != rowN) {
        APP_LOG(APP_LOG_LEVEL_DEBUG, "Got stale response %i when expecting %i", tok, rowN);
        next_rows();        // make sure current load is in progress (httpebble maybe gave previous HTTP_BUSY?)
        return;
    }
    
    Tuple* row = dict_find(res, MAP_KEY_ROW);
    if (row) {
        APP_LOG(APP_LOG_LEVEL_DEBUG, "Received %i bytes for row %i (%i)", row->length, rowN, code);
		uint8_t* currData = row->value->data;
		uint8_t currLength = row->length;
		while (currLength >= 18) {
			memcpy(imgData+20*rowN, currData, 18);
			currData += 18;
			currLength -= 18;
			rowN += 1;
		}
        if (rowN <= 168) next_rows();
        else reschedule_locTimer();
        layer_mark_dirty((Layer*)&map.layer);
    }
}

void rcv_fail(int32_t tok, int code, void* ctx) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "HTTP request failure (%i)", code);
}

void click_config(ClickConfig** config, void* ctx) {
    config[BUTTON_ID_UP]->click.handler = change_zoom;
    config[BUTTON_ID_UP]->click.repeat_interval_ms = 0.5e3;
    config[BUTTON_ID_UP]->context = (void*)(uintptr_t)true;
    config[BUTTON_ID_DOWN]->click.handler = change_zoom;
    config[BUTTON_ID_DOWN]->click.repeat_interval_ms = 0.5e3;
    config[BUTTON_ID_DOWN]->context = (void*)(uintptr_t)false;
    config[BUTTON_ID_SELECT]->click.handler = trigger_location;
    config[BUTTON_ID_SELECT]->click.repeat_interval_ms = 1e3;
}

void handle_init(AppContextRef ctx) {
    app = ctx;
    //resource_init_current_app(&APP_RESOURCES);
    http_set_app_id(0x0fba6c10);
    http_register_callbacks((HTTPCallbacks){
        .success = rcv_resp,
        .failure = rcv_fail,
        .location = rcv_location,
    }, NULL);
    request_location();
    
    window_init(&window, "Window Name");
    window_set_click_config_provider(&window, click_config);
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

void handle_timer(AppContextRef ctx, AppTimerHandle hdl, uint32_t tok) {
    if (hdl == locTimer) {
        locTimer = APP_TIMER_INVALID_HANDLE;
        request_location();
    }
}

void pbl_main(void *params) {
    PebbleAppHandlers handlers = {
        .init_handler = &handle_init,
        .timer_handler = &handle_timer,
        .messaging_info = {
            .buffer_sizes = {
                .inbound = 124,
                .outbound = 636,
            },
        },
    };
    app_event_loop(params, &handlers);
}
