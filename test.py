# ../libpebble/repl.py --lightblue <watch-id>
pebble.reinstall_app("/Users/natevw/Development/Pebble/wristmap/build/wristmap.pbw")

from time import sleep
num = 1
while True:
    pebble.app_message_send_byte_array("0fba6c1016ac40939abd8a1731c0d85a", 0, chr(num | 5))
    num <<= 1
    if num >= 256:
        num = 1
    sleep(0.5)
    
import sys
sys.path.append("../libpebble")
from pebble.httpebble import HTTPebble
pebble.install_bridge(HTTPebble)