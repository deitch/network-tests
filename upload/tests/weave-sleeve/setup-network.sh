#!/bin/bash

set -e

# set up network with private IPs for host 
# for net=bridge, simply put both addresses on lo
# because of port mapping, it will work just fine


COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

# open the firewall ports necessary
#   TCP 6783 and UDP 6783/6784
iptables -I FORWARD 1 -p tcp --dport 6783 -j ACCEPT
iptables -I FORWARD 1 -p tcp --dport 6784 -j ACCEPT
iptables -I FORWARD 1 -p udp --dport 6784 -j ACCEPT

# and for fast datapath
iptables -I FORWARD 1 -p tcp --dport $NETSERVERPORT -j ACCEPT
iptables -I FORWARD 1 -p tcp --dport $LOCALPORT -j ACCEPT
iptables -I FORWARD 1 -p udp --dport $LOCALPORT -j ACCEPT
iptables -I FORWARD 1 -p tcp --dport $REMOTEPORT -j ACCEPT
iptables -I FORWARD 1 -p udp --dport $REMOTEPORT -j ACCEPT


# need to account for our remote peers
WEAVE_NO_FASTDP=true weave launch --ipalloc-range 192.168.0.0/16 $PEER


