#!/bin/bash


# remove route
ip route del 10.0.0.0/8 via $PRIVATEGATEWAY dev $TEAMNIC
# remove IP
ip addr del $PRIVATEMGMTIPCIDR dev $TEAMNIC


