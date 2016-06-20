

# now get other env vars we care about
echo TEAMNIC=$(ip route | awk '/default/ {print $5}')
echo TEAMPORTS=$(ip link | awk -F: "/master $TEAMNIC/"' {print $2}')


# there are multiple routes that need to be cleanly separate
TEAMROUTES=$(ip ro | grep $TEAMNIC | grep -w via)

# get our gateway
echo PRIVATEGATEWAY=$(echo "$TEAMROUTES" | awk '/10.0.0.0\/8/ {print $3}')
echo PUBLICGATEWAY=$(echo "$TEAMROUTES" | awk '/default/ {print $3}')

echo TEAMROUTES=$(echo "$TEAMROUTES" | tr '\n' ',')
