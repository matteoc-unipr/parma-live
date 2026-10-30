#!/usr/bin/env bash
# Scarica un campione reale di ogni fonte dati in fixtures/.
# Uso: BUSONE_CONTACT=tua@email ./scripts/fetch-fixtures.sh
set -euo pipefail
: "${BUSONE_CONTACT:?imposta BUSONE_CONTACT (email inviata a BusOne in X-BusOne-Client)}"

cd "$(dirname "$0")/../fixtures"
CURL=(curl -fsS --max-time 120 --retry 2)
H=(-H "X-BusOne-Client: parma-live (uso personale); $BUSONE_CONTACT" -H "X-BusOne-Use: personal")
B=https://proxy.busone.app/tep

"${CURL[@]}" "${H[@]}" "$B/status" -o busone/status.json
"${CURL[@]}" "${H[@]}" "$B/gtfs-rt/vehicle-positions.json" -o busone/vehicle-positions.json
"${CURL[@]}" "${H[@]}" "$B/gtfs-rt/vehicle-positions.pb" -o busone/vehicle-positions.pb
"${CURL[@]}" "${H[@]}" "$B/gtfs-rt/trip-updates.pb" -o busone/trip-updates.pb
# Il JSON completo pesa ~600 KB: teniamo le prime 5 corse.
"${CURL[@]}" "${H[@]}" "$B/gtfs-rt/trip-updates.json" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); d["entity"]=d["entity"][:5]; json.dump(d,sys.stdout,indent=1)' \
  > busone/trip-updates.sample.json

"${CURL[@]}" https://temporeale.cl.tep.pr.it/temporeale/vehicle_positions.pb -o tep/vehicle_positions.pb
"${CURL[@]}" https://temporeale.cl.tep.pr.it/temporeale/trip_updates.pb -o tep/trip_updates.pb

# GTFS statico: 5 MB zip / 24 MB estratti. In fixtures solo file piccoli interi + teste dei grandi.
tmp=$(mktemp -d)
"${CURL[@]}" "${H[@]}" "$B/gtfs.zip" -o "$tmp/gtfs.zip"
unzip -oq "$tmp/gtfs.zip" -d "$tmp"
cp "$tmp/agency.txt" "$tmp/routes.txt" gtfs/
for f in stops trips stop_times shapes calendar_dates transfers; do head -200 "$tmp/$f.txt" > "gtfs/$f.sample.txt"; done
rm -rf "$tmp"
echo "ok"
