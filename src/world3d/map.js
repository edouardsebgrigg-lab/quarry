// Level design for the countryside map, in metres (x = east, z = south, y = up).
// The map runs from -1000 to 1000 on both axes. Game balance numbers stay in data/; this is
// only where things are. Vehicle yaws turn the model's +X (its front) about +Y: 0 faces east,
// PI/2 north, PI west, -PI/2 south. People's yaws are camera yaws: 0 looks north (-Z),
// PI/2 west, -PI/2 east.

export const MAP = {
  half: 1000, // the map is 2 km across
  cell: 4, // countryside height samples every 4 m

  // Public roads: smooth curves through these points.
  roads: [
    {
      id: 'millLane',
      name: 'Mill Lane',
      width: 6.4,
      points: [[-1000, -30], [-640, -36], [-320, -27], [0, -30], [200, -30], [330, -35], [425, -62], [505, -122], [562, -212],
        [598, -322], [615, -420], [622, -500], [626, -600], [633, -720], [640, -860], [645, -1000]],
    },
    {
      id: 'quarryRoad',
      name: 'Quarry Road',
      width: 6,
      // Branches west off Mill Lane in the middle of Ashby.
      points: [[621, -468], [582, -472], [522, -492], [458, -538], [396, -598], [330, -644], [250, -662], [160, -665],
        [40, -660], [-150, -650], [-400, -640], [-700, -650], [-1000, -656]],
    },
  ],

  // Your land: the field (the diggable ground plot, data/ground.json "home") and the yard.
  home: {
    name: 'Home Field',
    plot: { x0: 0, x1: 152, z0: 0, z1: 152 },
    yard: { x0: 158, x1: 204, z0: -14, z1: 54 },
    stockpiles: [{ id: 'west', x0: 166, x1: 175, z0: 42, z1: 52 }, { id: 'middle', x0: 178, x1: 187, z0: 42, z1: 52 }, { id: 'east', x0: 190, x1: 199, z0: 42, z1: 52 }],
    // Your property: site machines (not road-legal) can't go outside it.
    boundary: { x0: -2, x1: 206, z0: -16, z1: 154 },
    weighbridge: { x0: 178.3, x1: 181.7, z0: -12, z1: 4 },
    driveway: { x0: 176, x1: 184 }, // from the yard's north edge out to Mill Lane
    fieldGap: { z0: 8, z1: 20 }, // opening in the hedge between the yard and the field
    workshop: { x: 166, z: 27 }, // clear of the driveway and machine delivery slots
    office: { x: 193, z: -6, yaw: 0 }, // door faces south
    pickup: { x: 171, z: 24, yaw: Math.PI },
    // Where bought machines are delivered.
    parking: {
      excavator: [{ x: 166, z: 6, yaw: Math.PI }, { x: 166, z: -6, yaw: Math.PI }],
      truck: [{ x: 188, z: 26, yaw: Math.PI / 2 }, { x: 196, z: 26, yaw: Math.PI / 2 }],
      miniDigger: [{ x: 198, z: 14, yaw: Math.PI }, { x: 198, z: 19, yaw: Math.PI }],
      dumper: [{ x: 192, z: 15, yaw: Math.PI }, { x: 192, z: 20, yaw: Math.PI }],
      tractor: [{ x: 200, z: 4, yaw: -Math.PI / 2 }], // facing south: the trailer stands behind it, to the north
      spare: { x: 162, z: 32, stepX: 8 },
    },
    barrow: { x: 145.5, z: 14, yaw: -Math.PI / 2 }, // just inside the field, pointing at the yard
    playerSpawn: { x: 186, z: 8, yaw: Math.PI / 2 },
    sign: { x: 189, z: -21 },
  },

  village: {
    name: 'Ashby',
    signs: [[603, -352], [636, -640]], // "Ashby" signs where the lane enters and leaves the village
    // Houses sit back from the nearest road, facing it. `near` is roughly where; style picks the model.
    houses: [
      { near: [598, -392], style: 'cottage' },
      { near: [602, -418], style: 'semi' },
      { near: [605, -444], style: 'cottage' },
      { near: [608, -520], style: 'semi' },
      { near: [609, -546], style: 'bungalow' },
      { near: [610, -574], style: 'cottage' },
      { near: [612, -602], style: 'semi' },
      { near: [628, -392], style: 'semi' },
      { near: [634, -416], style: 'bungalow' },
      { near: [637, -441], style: 'cottage' },
      { near: [639, -466], style: 'semi' },
      { near: [640, -492], style: 'cottage' },
      { near: [642, -517], style: 'bungalow' },
      { near: [560, -462], style: 'cottage', road: 'quarryRoad' },
      { near: [538, -468], style: 'semi', road: 'quarryRoad' },
      { near: [575, -494], style: 'bungalow', road: 'quarryRoad' },
    ],
    pub: { near: [606, -484], name: 'The Plough', road: 'quarryRoad' },
  },

  // Ashby Plant: the machine dealer, on the east side of Mill Lane at the north end of the village.
  // Farmsteads out in the countryside (scenery): a farmhouse, a barn, a silo and bales. x, z is
  // the middle of the yard; yaw turns the farm (its front is +Z at 0).
  // They sit back from the lanes you drive along, like real farms; the first is across Mill Lane
  // from your gate.
  farms: [
    { name: 'Mill Farm', x: 80, z: -140, yaw: 0 },
    { name: 'Westfield Farm', x: -470, z: -150, yaw: 0.15, house: 'house_bungalow' },
    { name: 'Quarry Farm', x: 420, z: -720, yaw: Math.PI, house: 'house_semi' },
    { name: 'Grange Farm', x: 350, z: 150, yaw: -Math.PI / 2 },
  ],

  dealer: {
    name: 'Ashby Plant',
    yard: { x0: 640, x1: 704, z0: -604, z1: -546 },
    shed: { x: 680, z: -580, yaw: -Math.PI / 2 }, // big doors face west, to the lane
    door: { x: 670.6, z: -575.4 }, // just outside the office door (E opens the shop)
    driveway: { z0: -566, z1: -556 },
  },

  // Ashby Aggregates: where you sell. North side of Quarry Road.
  depot: {
    name: 'Ashby Aggregates',
    yard: { x0: 130, x1: 238, z0: -770, z1: -676 },
    driveway: { x0: 176, x1: 190 }, // from Quarry Road into the yard
    weighbridge: { x0: 181.3, x1: 184.7, z0: -698, z1: -682 }, // drive on heading north
    office: { x: 174, z: -690, yaw: Math.PI / 2 }, // door faces east, to the weighbridge
    // Bays along the back wall, open to the south. Ids are materials (data/depot.json).
    bays: [
      { id: 'topsoil', x0: 138, x1: 148 },
      { id: 'clay', x0: 150, x1: 160 },
      { id: 'sand', x0: 162, x1: 172 },
      { id: 'gravel', x0: 174, x1: 184 },
      { id: 'mixed', x0: 186, x1: 196 },
    ],
    bayZ: { z0: -766, z1: -750 },
    stockpiles: [[214, -752, 'gravel', 7], [224, -730, 'sand', 6], [210, -716, 'gravel', 5]],
  },

  // Field hedges (as well as the ones along the roads), copses and single trees.
  hedges: [
    [[-6, -8], [-6, 158], [158, 158], [158, 40]], // round the west, south and east of your field
    [[-6, -8], [158, -8]], // along the lane side of your field
    [[-300, -20], [-300, -620]],
    [[-620, 300], [340, 300], [360, 700]],
    [[-1000, 280], [-620, 300]],
    [[340, 300], [700, 250], [1000, 260]],
    [[360, -20], [300, 300]],
    [[-640, -40], [-600, -640]],
    [[660, -40], [700, 250]],
    [[40, -320], [420, -300]],
    [[-300, -320], [40, -320]],
    [[720, -760], [1000, -740]],
    [[-400, -660], [-420, -1000]],
    [[240, -780], [220, -1000]],
    [[-100, 450], [-120, 1000]],
    [[500, 550], [520, 1000]],
  ],
  copses: [[-420, 130, 34], [260, 190, 26], [-180, -460, 40], [820, -300, 36], [-760, -300, 30], [420, 620, 34],
    [-600, 640, 40], [120, -900, 30], [860, 480, 28], [-820, -860, 34], [480, -860, 26], [760, 120, 24]],
  // Poplars along the lane east of your field.
  poplars: [[230, -40], [340, -45]],
};

// Is (x, z) inside a rectangle { x0, x1, z0, z1 } (grown by `margin`)?
export function inRect(r, x, z, margin = 0) {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}
