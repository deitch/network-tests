#!/bin/bash

# add IP
ip addr add $PRIVATEMGMTIPCIDR dev $TEAMNIC
# add route
ip route add 10.0.0.0/8 via $PRIVATEGATEWAY dev $TEAMNIC

# must ping the gateway so it register our mac address
ping -c 3 -W 2 $PRIVATEGATEWAY >/dev/null 2>&1 || true

