#!/bin/bash

# now get other env vars we care about
TEAMNIC=$(ip route | awk '/default/ {print $5}')
TEAMPORTS=$(ip link | awk -F: "/master $TEAMNIC/"' {print $2}')

# there are multiple routes that need to be cleanly separate
TEAMROUTES=$(ip ro | grep $TEAMNIC | grep -w via)

# get our gateway
PRIVATEGATEWAY=$(echo "$TEAMROUTES" | awk '/10.0.0.0\/8/ {print $3}')
PUBLICGATEWAY=$(echo "$TEAMROUTES" | awk '/default/ {print $3}')

echo TEAMNIC=$TEAMNIC
echo TEAMPORTS=$TEAMPORTS
echo TEAMROUTES=$(echo "$TEAMROUTES" | tr '\n' ',')
echo PRIVATEGATEWAY=$PRIVATEGATEWAY
echo PUBLICGATEWAY=$PUBLICGATEWAY
