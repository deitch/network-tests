#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

# stop weave
weave stop

# remove firwall ports
iptables -D FORWARD -p tcp --dport 6783 -j ACCEPT
iptables -D FORWARD -p tcp --dport 6784 -j ACCEPT
iptables -D FORWARD -p udp --dport 6784 -j ACCEPT

iptables -D FORWARD -p tcp --dport $NETSERVERPORT -j ACCEPT
iptables -D FORWARD -p tcp --dport $LOCALPORT -j ACCEPT
iptables -D FORWARD -p udp --dport $LOCALPORT -j ACCEPT
iptables -D FORWARD -p tcp --dport $REMOTEPORT -j ACCEPT
iptables -D FORWARD -p udp --dport $REMOTEPORT -j ACCEPT
