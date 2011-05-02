

var shootSnd, hunterShootSnd, splodeSnd, failSnd, dingSnd, pickupSnd, dropSnd;
var shootBank = [], pewBank = [], splodeBank = [], dingBank = [];

soundManager.url = 'swf/';
soundManager.debugMode = false;
soundManager.useFlashBlock = true;
soundManager.onload = function() {
	failSnd = soundManager.createSound('fail', 'sfx/fail.mp3');
	dropSnd = soundManager.createSound('drop', 'sfx/drop.mp3');
	pickupSnd = soundManager.createSound('pickup', 'sfx/pickup.mp3');
	
	for (var x=0; x<4;x++) {
	for (var i=1; i<=5; i++) {
		shootBank.push(soundManager.createSound('shoot'+x+i, 'sfx/pchew.mp3'));
		pewBank.push(soundManager.createSound('pew'+x+i, 'sfx/voice/hunter/'+i+'.mp3'));
		dingBank.push(soundManager.createSound('bang'+x+i, 'sfx/ding.mp3'));
		splodeBank.push(soundManager.createSound('splode'+x+i, 'sfx/splode/' + i + '.mp3'));
	}}
	
};


window.onload = function() {

var pause = false;

var control = {
	up: false,
	left: false,
	right: false,
	down: false,
	z: false,
	x: false,
	c: false,
	a: false,
	s: false
};

var camera, scene, renderer;
var planets = [];

// object containers
var friendlyBullets = [];
var enemyBullets = [];
var attractors = [];
var repulsers = [];
var hunters = [];
var hulls = [];

// object pools
var friendlyBulletPool = [];
var enemyBulletPool = [];
var attractPool = [];
var repulsePool = [];
var hunterPool = [];
var hullPool = [];

// quad tree containers (faster spatial searching)
var friendlyBulletTree, enemyBulletTree;

var player;
var thePackage;
var theDestination;

// object geometries
// TODO: unfuck mesh orientations
var shipGeo, pointerGeo, hunterGeo, attractGeo, repulseGeo;

var mode = 'first';
var bulletDamage = 3;
var maxHunters = 5;
var hunterHealth = 2;


var loader = new THREE.JSONLoader( true );



window.onkeydown = function(e) {
	switch (e.which) {
		case 38: control.up = true; break;
		case 40: control.down = true; break;
		case 37: control.left = true; break;
		case 39: control.right = true; break;
		case 90: control.z = true; break;
		case 88: control.x = true; break;
		case 65: if (mode = 'play') { buyBulletUpgrade(); }; break;
		case 83: if (mode = 'play') { buyHealth(); }; break;
	}
};
window.onkeyup = function(e) {
	switch (e.which) {
		case 38: control.up = false; break;
		case 40: control.down = false; break;
		case 37: control.left = false; break;
		case 39: control.right = false; break;
		case 90: control.z = false; break;
		case 88: player.fireGravityWell(); control.x = false; break;
		case 80: pause = !pause; break;
	}
};


var Planet = function(x,y,r,color,sunDist,orbitRate,orbitPos,flatShade) {
	var geo = new THREE.Sphere(r, 15, 15);
	var mat = flatShade ? new THREE.MeshBasicMaterial({color: color}) : new THREE.MeshLambertMaterial({color: color});
	var mesh = new THREE.Mesh(geo, mat);
	mesh.position.x = sunDist*Math.cos(orbitPos);
	mesh.position.y = sunDist*Math.sin(orbitPos);
	scene.addObject(mesh);
	
	this.mesh = mesh;
	this.r = r;
	this.sunDist = sunDist;
	this.orbitRate = orbitRate;
	this.orbitPos = orbitPos;
};
Planet.prototype = {
	moveDt: function(dt) {
		this.orbitPos += this.orbitRate * dt;
		this.mesh.position.x = this.sunDist*Math.cos(this.orbitPos);
		this.mesh.position.y = this.sunDist*Math.sin(this.orbitPos);
		//this.mesh.rotation.z += 0.1;
	},
	// jsQuad stuff
	QTsetParent: function(parent) {
		this.QTparent = parent;
	},
	QTgetParent: function() {
		return this.QTparent;
	},
	QTenclosed: function(xMin,yMin,xMax,yMax) {
		var x0 = this.x-this.r, x1 = this.x+this.r;
		var y0 = this.y-this.r, y1 = this.y+this.r;
		return x0 >= xMin && x1 <= xMax && y0 >= yMin && y1 <= yMax;
	},
	QToverlaps: function(xMin,yMin,xMax,yMax) {
		var x0 = this.x-this.r, x1 = this.x+this.r;
		var y0 = this.y-this.r, y1 = this.y+this.r;
		return !(x1 < xMin || x0 > xMax || y1 < yMin || y0 > yMax);
	},
	QTquadrantNode: function(node, x, y) {
		var x0 = this.x-this.r, x1 = this.x+this.r;
		if (x0 > x) {
			var y0 = this.y-this.r, y1 = this.y+this.r;
			if (y0 > y) {
				return node.q1;
			} else if (y1 < y) {
				return node.q4;
			} else {
				return null;
			}
		} else if (x1 < x) {
			var y0 = this.y-this.r, y1 = this.y+this.r;
			if (y0 > y) {
				return node.q2;
			} else if (y1 < y) {
				return node.q3;
			} else {
				return null;
			}
		} else {
			return null;
		}
	}
};

var Package = function() {
	var geo = new THREE.Cube(15,15,15,2,2,2);
	var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: 0x0000ff, wireframe: true}));
	mesh.position.z = -9999999;
	mesh.rotation.y = 0;
	scene.addObject(mesh);
	this.owner = undefined;
	this.mesh = mesh;
	
	this.moveDt = function(dt) {
		this.mesh.rotation.z += 3.14/4*dt;
		if (this.owner === undefined) {
			return;
		}
		if (this.owner instanceof Planet) {
			this.mesh.position.x = this.owner.mesh.position.x+(this.owner.r+40)*Math.cos(this.mesh.rotation.z/2);
			this.mesh.position.y = this.owner.mesh.position.y+(this.owner.r+40)*Math.sin(this.mesh.rotation.z/2);
			this.mesh.position.z = 0;
			
			var dx = this.mesh.position.x - player.mesh.position.x;
			var dy = this.mesh.position.y - player.mesh.position.y;
			if (dx*dx+dy*dy < 80*80) {
				this.owner = player;
				pickupSnd.play();
			}
			
		} else {
			this.mesh.position.x = this.owner.mesh.position.x;
			this.mesh.position.y = this.owner.mesh.position.y;
			this.mesh.position.z = 40;
			
			var dx = this.mesh.position.x - theDestination.mesh.position.x;
			var dy = this.mesh.position.y - theDestination.mesh.position.y;
			if (dx*dx+dy*dy < 80*80) {
				player.deliveries++;
				player.score += 1000 * parseInt(maxHunters/5);
				player.cash += 100;
				dropSnd.play();
				randomizePackage();
			}
		}
	};
};

var Destination = function() {
	var geo = new THREE.Cube(15,15,15);
	var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: 0x4444aa, wireframe: true}));
	mesh.position.z = -9999999;
	mesh.rotation.y = 0;
	scene.addObject(mesh);
	this.owner = null;
	this.mesh = mesh;
	
	this.moveDt = function(dt) {
		if (this.owner !== null) {
			this.mesh.rotation.z += 3.14/4*dt;
			this.mesh.position.x = this.owner.mesh.position.x+(this.owner.r+40)*Math.cos(this.mesh.rotation.z/2);
			this.mesh.position.y = this.owner.mesh.position.y+(this.owner.r+40)*Math.sin(this.mesh.rotation.z/2);
			this.mesh.position.z = 0;
		} else {
			this.mesh.position.z = -9999999;
		}
	};
};

var Bullet = function(x,y,vx,vy,lifetime,color) {
	var geo = new THREE.Sphere(3, 4, 4);
	var mat = new THREE.MeshBasicMaterial({color: color});
	var part = new THREE.Mesh(geo, mat);
	part.position.x = x;
	part.position.y = y;
	scene.addObject(part);
	this.part = part;
	this.vx = vx;
	this.vy = vy;
	this.lifetime = lifetime;
	this.impact = false;
	this.r = 6;
};
Bullet.prototype = {
	moveDt: function(dt) {
		this.lifetime -= dt;
		if (this.lifetime <= 0 || this.impact) {
			return true;
		}
		var x = this.part.position.x;
		var y = this.part.position.y;
		for (var i=0; i<attractors.length; i++) {
			var w = attractors[i];
			var dx = x - w.mesh.position.x;
			var dy = y - w.mesh.position.y;
			var d2 = dx*dx+dy*dy;
			var ns = 1/Math.sqrt(d2);
			var g = w.g*300/d2;
			this.vx += dx*ns*g*dt;
			this.vy += dy*ns*g*dt;
		}
		for (var i=0; i<repulsers.length; i++) {
			var w = repulsers[i];
			var dx = x - w.mesh.position.x;
			var dy = y - w.mesh.position.y;
			var d2 = dx*dx+dy*dy;
			var ns = 1/Math.sqrt(d2);
			var g = w.g*300/d2;
			this.vx += dx*ns*g*dt;
			this.vy += dy*ns*g*dt;
		}
		this.part.position.x += this.vx*dt;
		this.part.position.y += this.vy*dt;
		return false;
	},
	QTsetParent: function(parent) {
		this.QTparent = parent;
	},
	QTgetParent: function() {
		return this.QTparent;
	},
	QTenclosed: function(xMin,yMin,xMax,yMax) {
		var x0 = this.part.position.x-this.r, x1 = this.part.position.x+this.r;
		var y0 = this.part.position.y-this.r, y1 = this.part.position.y+this.r;
		return x0 >= xMin && x1 <= xMax && y0 >= yMin && y1 <= yMax;
	},
	QToverlaps: function(xMin,yMin,xMax,yMax) {
		var x0 = this.part.position.x-this.r, x1 = this.part.position.x+this.r;
		var y0 = this.part.position.y-this.r, y1 = this.part.position.y+this.r;
		return !(x1 < xMin || x0 > xMax || y1 < yMin || y0 > yMax);
	},
	QTquadrantNode: function(node, x, y) {
		var x0 = this.part.position.x-this.r, x1 = this.part.position.x+this.r;
		if (x0 > x) {
			var y0 = this.part.position.y-this.r, y1 = this.part.position.y+this.r;
			if (y0 > y) {
				return node.q1;
			} else if (y1 < y) {
				return node.q4;
			} else {
				return null;
			}
		} else if (x1 < x) {
			var y0 = this.part.position.y-this.r, y1 = this.part.position.y+this.r;
			if (y0 > y) {
				return node.q2;
			} else if (y1 < y) {
				return node.q3;
			} else {
				return null;
			}
		} else {
			return null;
		}
	}
};
var assignBullet = function(pool, dest, tree, x, y, vx, vy, lifetime) {
	var bullet = (pool.splice(0,1))[0];
	if (bullet === undefined) { return false; }
	bullet.part.position.x = x;
	bullet.part.position.y = y;
	bullet.part.position.z = 0;
	bullet.vx = vx;
	bullet.vy = vy;
	bullet.lifetime = lifetime;
	bullet.impact = false;
	dest.push(bullet);
	tree.insert(bullet);
};
var iterateBullets = function(pool, list, tree, cb, dt) {
	for (var i=0; i<list.length; i++) {
		var item = list[i];
		var d = cb.call(item, dt);
		if (d == true) {
			item.part.position.z = -9999999;
			pool.push((list.splice(i--, 1))[0]);
		} else {
			tree.reinsert(item);
		}
	}
};


var GravityWell = function(x,y,g,geo) {
	var mat = new THREE.MeshLambertMaterial({color: g < 0 ? 0x00ff00 : 0xff00ff});
	var mesh = new THREE.Mesh(geo, mat);
	mesh.position.x = x;
	mesh.position.y = y;
	mesh.position.z = -9999999;
	mesh.rotation.x = -3.14/4;
	mesh.scale.x = mesh.scale.y = mesh.scale.z = Math.abs(g)/150;
	scene.addObject(mesh);
	this.mesh = mesh;
	this.g = g;
};
GravityWell.prototype = {
	fadeDt: function(dt) {
		this.g *= Math.pow(0.9,dt);
		this.mesh.scale.x = this.mesh.scale.y = this.mesh.scale.z = Math.abs(this.g)/150;
		if (Math.abs(this.g) < 100) {
			return true;
		}
	}
};
var assignGravityWell = function(pool, dest, x, y, g) {
	var well = (pool.splice(0,1))[0];
	if (well === undefined) { return false; }
	well.mesh.position.x = x;
	well.mesh.position.y = y;
	well.mesh.position.z = 0;
	well.g = g;
	dest.push(well);
};
var iterateGravityWells = function(pool, list, cb, dt) {
	for (var i=0; i<list.length; i++) {
		if (cb.call(list[i], dt) === true) {
			list[i].mesh.position.z = -9999999;
			pool.push((list.splice(i--, 1))[0]);
		}
	}
};


var Player = function(x,y,dir) {
	var mesh = new THREE.Mesh(shipGeo, new THREE.MeshLambertMaterial({color:0xffffff}));
	mesh.position.x = x;
	mesh.position.y = y;
	mesh.rotation.x = 3.14/2;
	mesh.scale.x = 4;
	mesh.scale.y = 4;
	mesh.scale.z = 4;
	scene.addObject(mesh);
	camera.target = mesh;
	
	var pointer = new THREE.Mesh(pointerGeo, new THREE.MeshLambertMaterial({color:0x00ff00, opacity:0.5}));
	pointer.position.x = mesh.position.x;
	pointer.position.y = mesh.position.y;
	pointer.position.z = -20;
	pointer.rotation.x = 3.14/2;
	pointer.scale.x = pointer.scale.y = pointer.scale.z = 25;
	scene.addObject(pointer);
	
	this.pointer = pointer;
	this.mesh = mesh;
	this.vx = 0;
	this.vy = 0;
	this.turnActive = true;
	this.bulletScatter = 0;
	this.gwellCooldown = 0;
	this.bulletUpgrade = 0;
	this.deliveries = 0;
	
	this.collide = function() {
		var x = this.mesh.position.x, y = this.mesh.position.y;
		var h = this;
		enemyBulletTree.applyOverlapping(x-40,y-40,x+40,y+40,function(b) {
			if (b.part.position.z < 0) { return; }
			var dx = x-b.part.position.x, dy = y-b.part.position.y;
			var d2 = dx*dx+dy*dy;
			if (d2 < 20*20) {
				h.health -= bulletDamage;
				b.impact = true;
				var snd = dingBank[parseInt(Math.random()*dingBank.length)];
				snd.play();
			}
		});
		if (h.health <= 0) {
			return true;
		}
		return false;
	};
	this.moveDt = function(dt) {
		var x = this.mesh.position.x;
		var y = this.mesh.position.y;
		if (control.up) {
			var dvx = dt*150*Math.cos(this.mesh.rotation.y-3.14/2);
			var dvy = dt*150*Math.sin(this.mesh.rotation.y-3.14/2);
			this.vx += dvx;
			this.vy += dvy;
		} else if (control.down) {
			var dvx = dt*-100*Math.cos(this.mesh.rotation.y-3.14/2);
			var dvy = dt*-100*Math.sin(this.mesh.rotation.y-3.14/2);
			this.vx += dvx;
			this.vy += dvy;
		}
		mesh.position.x += this.vx*dt;
		mesh.position.y += this.vy*dt;
		
		for (var i=0; i< planets.length; i++) {
			var p = planets[i];
			var dx = x - p.mesh.position.x;
			var dy = y - p.mesh.position.y;
			var d2 = dx*dx+dy*dy;
			if (d2 > 0) {
				var ns = 1/Math.sqrt(d2);
				
				var inc = p.r - Math.sqrt(d2);
				if (inc > 0) {
					// TODO: real collisions
					this.vx = -this.vx;
					this.vy = -this.vy;
					this.mesh.position.x += this.vx*dt*2.1;
					this.mesh.position.y += this.vy*dt*2.1;
				} else {
					var g = -60*p.r*p.r/d2;
					this.vx += dx*ns*g*dt;
					this.vy += dy*ns*g*dt;
				}
			}
		}
		
		this.vx *= Math.pow(0.6,dt);
		this.vy *= Math.pow(0.6,dt);
		
		// bounce off walls
		var ix = -x - 1000;
		if (ix > 0) {
			this.vx = 0.5*Math.abs(this.vx);
			this.mesh.position.x += ix*2;
		} else {
			ix = x - 1000;
			if (ix > 0) {
				this.vx = -0.5*Math.abs(this.vx);
				this.mesh.position.x -= ix*2;
			}
		}
		var iy = -y - 1000;
		if (iy > 0) {
			this.vy = 0.5*Math.abs(this.vy);
			this.mesh.position.y += iy*2;
		} else {
			iy = y - 1000;
			if (iy > 0) {
				this.vy = -0.5*Math.abs(this.vy);
				this.mesh.position.y -= iy*2;
			}
		}
		if (control.left) {
			mesh.rotation.y += 3.14*dt;
		} else if (control.right) {
			mesh.rotation.y -= 3.14*dt;
		}
		camera.position.z = 500;
		camera.position.x = this.mesh.position.x;
		camera.position.y = this.mesh.position.y - 300;
		pointer.position.x = this.mesh.position.x;
		pointer.position.y = this.mesh.position.y;
		
		
		if (thePackage.owner === this) {
			var dx = this.mesh.position.x - theDestination.mesh.position.x;
			var dy = this.mesh.position.y - theDestination.mesh.position.y;
			pointer.rotation.y = Math.atan2(dy,dx)+3.14;
		} else {
			var dx = this.mesh.position.x - thePackage.mesh.position.x;
			var dy = this.mesh.position.y - thePackage.mesh.position.y;
			pointer.rotation.y = Math.atan2(dy,dx)+3.14;
		}
		
	};
	this.fireBullet = function() {
		var ship = this;
		var snd = shootBank[parseInt(Math.random()*shootBank.length)];
		snd.play();
		for (var i=0; i<=this.bulletUpgrade;i++) {
			assignBullet(friendlyBulletPool, friendlyBullets, friendlyBulletTree,
				ship.mesh.position.x,
				ship.mesh.position.y,
				100*Math.cos(ship.mesh.rotation.y-3.14/2+(ship.bulletScatter+0.2)*(Math.random()-0.5))+ship.vx,
				100*Math.sin(ship.mesh.rotation.y-3.14/2+(ship.bulletScatter+0.2)*(Math.random()-0.5))+ship.vy,
				6
			);
		}
	};
	this.fireGravityWell = function() {
		if (this.gwellCooldown === 0) {
			assignGravityWell(attractPool, attractors,
				player.mesh.position.x,
				player.mesh.position.y,
				-2000
			);
			for (var i=0; i<5; i++) {
				assignGravityWell(repulsePool, repulsers,
					player.mesh.position.x+Math.random()*300-150,
					player.mesh.position.y+Math.random()*300-150,
					1000
				);
			}
			this.gwellCooldown = 20;
		}
	}
};


var HunterHull = function(x,y,dir) {
	var mesh = new THREE.Mesh(hunterGeo, new THREE.MeshLambertMaterial({color:0xffaa00, opacity: 0.6}));
	mesh.position.x = x;
	mesh.position.y = y;
	mesh.position.z = -9999999;
	mesh.rotation.x = 3.14/2;
	mesh.scale.x = 4;
	mesh.scale.y = 4;
	mesh.scale.z = 4;
	scene.addObject(mesh);
	this.health = 3;
	this.mesh = mesh;
	this.vx = 0;
	this.vy = 0;
	this.shouldFire = false;
	this.cooldown = 0;
	this.target = player;
};
HunterHull.prototype = {
	moveDt: function(dt) {
		var mesh = this.mesh;
		mesh.position.x += this.vx*dt;
		mesh.position.y += this.vy*dt;
		mesh.position.z += -2*dt;
		mesh.rotation.x += 3*dt;
		mesh.rotation.y += 5*dt;
		mesh.rotation.z += 3*dt;
		this.lifetime -= dt;
		if (this.lifetime < 0) {
			return true;
		}
		return false;
	}
}
var assignHunterHull = function(pool, dest, hunter) {
	var hull = (pool.splice(0,1))[0];
	if (hull === undefined) { return false; }
	hull.mesh.position.x = hunter.mesh.position.x;
	hull.mesh.position.y = hunter.mesh.position.y;
	hull.mesh.position.z = 0;
	hull.vx = hunter.vx;
	hull.vy = hunter.vy;
	hull.lifetime = 4;
	dest.push(hull);
};
var iterateHunterHulls = function(pool, list, cb, dt) {
	for (var i=0; i<list.length; i++) {
		if (cb.call(list[i], dt) === true) {
			list[i].mesh.position.z = -9999999;
			pool.push((list.splice(i--, 1))[0]);
		}
	}
};




var Hunter = function(x,y,dir) {
	var mesh = new THREE.Mesh(hunterGeo, new THREE.MeshLambertMaterial({color:0xffaa00}));
	mesh.position.x = x;
	mesh.position.y = y;
	mesh.position.z = -9999999;
	mesh.rotation.x = 3.14/2;
	mesh.scale.x = 4;
	mesh.scale.y = 4;
	mesh.scale.z = 4;
	scene.addObject(mesh);
	this.health = 3;
	this.mesh = mesh;
	this.vx = 0;
	this.vy = 0;
	this.shouldFire = false;
	this.cooldown = 0;
	this.target = player;
};
Hunter.prototype = {
	collide: function() {
		var x = this.mesh.position.x, y = this.mesh.position.y;
		var h = this;
		friendlyBulletTree.applyOverlapping(x-40,y-40,x+40,y+40,function(b) {
			if (b.part.position.z < 0) { return; }
			var dx = x-b.part.position.x, dy = y-b.part.position.y;
			var d2 = dx*dx+dy*dy;
			if (d2 < 20*20) {
				h.health--;
				b.impact = true;
				var snd = dingBank[parseInt(Math.random()*dingBank.length)];
				snd.play();
			}
		});
		if (h.health <= 0) {
			player.score += 100;
			player.kills++;
			assignHunterHull(hullPool, hulls, h);
			var snd = splodeBank[parseInt(Math.random()*splodeBank.length)];
			snd.play();
			return true;
		}
		return false;
	},
	moveDt: function(dt) {
		var x = this.mesh.position.x;
		var y = this.mesh.position.y;
		var mesh = this.mesh;
		mesh.position.x += this.vx*dt;
		mesh.position.y += this.vy*dt;
		
		for (var i=0; i< planets.length; i++) {
			var p = planets[i];
			var dx = x - p.mesh.position.x;
			var dy = y - p.mesh.position.y;
			var d2 = dx*dx+dy*dy;
			if (d2 > 1) {
				var ns = 1/Math.sqrt(d2);
				var g = 100*p.r*p.r/d2;
				this.vx += dx*ns*g*dt;
				this.vy += dy*ns*g*dt;
			}
		}
		for (var i=0; i< hunters.length; i++) {
			var p = hunters[i];
			var dx = x - p.mesh.position.x;
			var dy = y - p.mesh.position.y;
			var d2 = dx*dx+dy*dy;
			if (d2 > 40 && d2 < 200*200) {
				var ns = 1/Math.sqrt(d2);
				var g = 70000/d2;
				this.vx += dx*ns*g*dt;
				this.vy += dy*ns*g*dt;
			}
		}
		
		var target = this.target;
		this.shouldFire = false;
		if (target !== null) {
			var tx = target.mesh.position.x;
			var ty = target.mesh.position.y;
			var x = this.mesh.position.x;
			var y = this.mesh.position.y;
			var dx = x - tx;
			var dy = y - ty;
			var d2 = dx*dx+dy*dy;
			if (target instanceof Planet) {
				d2 -= target.r*target.r;
			}
			this.targetDist = Math.sqrt(d2);
			var ca = mesh.rotation.y;
			var ta = Math.atan2(dy,dx)+Math.PI;
			var da = ca - ta;
			var mda = da;
			if (Math.abs(da-6.28) < Math.abs(mda)) {
				mda = da-6.28;
			}
			if (Math.abs(da+6.28) < Math.abs(mda)) {
				mda = da+6.28;
			}
			
			this.mesh.rotation.y -= mda * Math.pow(0.005,dt);
			
			if (d2 > 150*150 && Math.abs(mda) < 1) {
				var dvx = dt*120*Math.cos(this.mesh.rotation.y);
				var dvy = dt*120*Math.sin(this.mesh.rotation.y);
				this.vx += dvx;
				this.vy += dvy;
			}
			if (d2 < 300*300 && Math.abs(mda) < 1) {
				this.shouldFire = true;
			}
		}
		
		this.vx *= Math.pow(0.7,dt);
		this.vy *= Math.pow(0.7,dt);
		
		// bounce off walls
		var ix = -x - 1000;
		if (ix > 0) {
			this.vx = 0.5*Math.abs(this.vx);
			this.mesh.position.x += ix*2;
		} else {
			ix = x - 1000;
			if (ix > 0) {
				this.vx = -0.5*Math.abs(this.vx);
				this.mesh.position.x -= ix*2;
			}
		}
		var iy = -y - 1000;
		if (iy > 0) {
			this.vy = 0.5*Math.abs(this.vy);
			this.mesh.position.y += iy*2;
		} else {
			iy = y - 1000;
			if (iy > 0) {
				this.vy = -0.5*Math.abs(this.vy);
				this.mesh.position.y -= iy*2;
			}
		}
	},
	fireBullet: function() {
		if (this.cooldown > 0) { this.cooldown--; }
		if (this.shouldFire && this.cooldown == 0) {
			this.cooldown = 7;
			var snd = pewBank[parseInt(Math.random()*pewBank.length)];
			snd.play();
			assignBullet(enemyBulletPool, enemyBullets, enemyBulletTree,
				this.mesh.position.x,
				this.mesh.position.y,
				150*Math.cos(this.mesh.rotation.y),
				150*Math.sin(this.mesh.rotation.y),
				5, 0xff0000
			);
		}
	}
}
var assignHunter = function(pool, dest, x, y, health) {
	var hunter = (pool.splice(0,1))[0];
	if (hunter === undefined) { return false; }
	hunter.mesh.position.x = x;
	hunter.mesh.position.y = y;
	hunter.mesh.position.z = 0;
	hunter.health = hunterHealth;
	hunter.target = player;
	hunter.shouldFire = false;
	hunter.cooldown = 20;
	dest.push(hunter);
};
var iterateHunters = function(pool, list, cb, dt) {
	for (var i=0; i<list.length; i++) {
		if (cb.call(list[i], dt) === true) {
			list[i].mesh.position.z = -9999999;
			pool.push((list.splice(i--, 1))[0]);
		}
	}
};



function init() {
	friendlyBulletTree = new jsQuad(-1500,-1500,1500,1500,5);
	enemyBulletTree = new jsQuad(-1500,-1500,1500,1500,5);
	initThree();
}

function initPools() {
	for (var i=0;i<100;i++) {
		friendlyBulletPool.push(new Bullet(0,0,0,0,0,0x00aaff));
		enemyBulletPool.push(new Bullet(0,0,0,0,0,0xff0000));
		hunterPool.push(new Hunter(0,0,0));
		hullPool.push(new HunterHull(0,0,0));
	}
	for (var i=0;i<50;i++) {
		attractPool.push(new GravityWell(0,0,-1000,attractGeo));
		repulsePool.push(new GravityWell(0,0,1000,repulseGeo));
	}
}

function initObjects() {
	// some fixed lighting
	var dLight = new THREE.PointLight(0xffffff);
	scene.addLight(dLight);
	
	var aLight = new THREE.AmbientLight(0x444444);
	scene.addLight(aLight);
	
	// grids help keep some idea of where you are
	var plane = new THREE.Plane(2000,2000,10,10);
	var pMesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({color:0xffffff, wireframe: true}));
	scene.addObject(pMesh);
	
	var plane2 = new THREE.Plane(2000,2000,50,50);
	var pMesh2 = new THREE.Mesh(plane2, new THREE.MeshBasicMaterial({color:0x444444, wireframe: true}));
	pMesh2.position.z -= 10;
	scene.addObject(pMesh2);
	
	player = new Player(
		Math.random() * 1000 - 500,
		Math.random() * 1000 - 500,
		Math.random() * 6.28
	);

	sun = new Planet(0,0,150,0xffff00,0,0,0,true); // lol
	planets.push(sun);
	// create planets
	var sd = 400;
	for (i=0; i<6;i++) {
		var x = Math.random()*1800-900;
		var y = Math.random()*1800-900;
		var r = 20 + Math.random()*20;
		var rot = (3.14+Math.random()*3.14)/180;
		var p = new Planet(sd,0,r,Math.random()*0x444444+0xaaaaaa,sd,rot,Math.random()*6.28);
		planets.push(p);
		sd += 100;
	}
	thePackage = new Package();
	theDestination = new Destination();
	
	initPools();
}


function initThree() {
	
	function getDim() {
		var dim = $('content').getDimensions();
		dim.height -= 70;
		return dim;
	};
	
	var dim = getDim();
	camera = new THREE.Camera(45, dim.width/dim.height, 1, 10000);
	camera.position.z = 3000;

	scene = new THREE.Scene();

	renderer = new THREE.WebGLRenderer();
	renderer.setSize(dim.width, dim.height);
	document.getElementById('display').appendChild(renderer.domElement);
	
	
	function setDim() {
		var dim = getDim();
		camera.aspect = dim.width/dim.height;
		camera.updateProjectionMatrix();
		renderer.setSize(dim.width, dim.height);
	}
	window.onresize = setDim;
	
	// make sure some models are loaded before spawning stuff
	loader.load({
		model: 'models/ship.js',
		callback: function(geometry) {
			shipGeo = geometry;
			loader.load({
				model: 'models/hunter.js',
				callback: function(geometry) {
					hunterGeo = geometry;
					loader.load({
						model: 'models/attract.js',
						callback: function(geometry) {
							attractGeo = geometry;
							loader.load({
								model: 'models/repulse.js',
								callback: function(geometry) {
									repulseGeo = geometry;
									loader.load({
										model: 'models/pointer.js',
										callback: function(geometry) {
											pointerGeo = geometry;
											initObjects();
											showPlay();
											//startGame();
											//gameLoop();
											
										}
									});
								}
							});
						}
					});
				}
			});
		}
	});
}

function showPlay() {
	$('load').style.display = 'none';
	$('play').style.display = 'block';
	$('fplay').onclick = startGame;
}

function startGame() {
	// create player
	
	gameLoop();
	player.moveDt(0);
	setInterval(gunShotLoop, 100);
	setInterval(escalate, 3000);
	setInterval(updateUI, 200);
	
	newGame();
}

var timers = [];
function gameOver() {
	mode = 'gameover';
	
	$('fscore').innerHTML = player.score;
	$('fdeliver').innerHTML = player.deliveries;
	$('fcash').innerHTML = player.cash;
	$('fkill').innerHTML = player.kills;
	
	while (timers.length > 0) {
		timers.splice(0,1);
	}
	
	iterateBullets(friendlyBulletPool, friendlyBullets, friendlyBulletTree, function(){return true;});
	iterateBullets(enemyBulletPool, enemyBullets, enemyBulletTree, function(){return true;});
	iterateGravityWells(attractPool, attractors, function(){return true;});
	iterateGravityWells(repulsePool, repulsers, function(){return true;});
	iterateHunters(hunterPool, hunters, function(){return true;});
	
	
	$('gameover').style.display = 'block';
	$('overlay').style.display = 'block';
	$('rplay').onclick = newGame;
}



function newGame() {
	$('play').style.display = 'none';
	$('gameover').style.display = 'none';
	$('overlay').style.display = 'none';
	mode = 'play';
	maxHunters = 5;
	
	// clear out old objects
	
	var t = Math.random()*6.28;
	player.mesh.position.x = 500*Math.cos(t);
	player.mesh.position.y = 500*Math.sin(t);
	player.vx = 0;
	player.vy = 0;
	player.health = 100;
	player.cash = 0;
	player.score = 0;
	player.bulletUpgrade = 0;
	player.deliveries = 0;
	player.kills = 0;
	
	randomizePackage();
}

function randomizePackage() {
	var oldTarget = theDestination.owner;
	thePackage.owner = planets[parseInt(Math.random()*(planets.length-1))+1];
	thePackage.moveDt(0);
	
	theDestination.owner = planets[parseInt(Math.random()*(planets.length-1))+1];
	theDestination.moveDt(0);
};



function moveThings(dt) {
	// planets gotta orbit
	for(var i=0; i<planets.length;i++) {
		planets[i].moveDt(dt);
	}
	
	iterateBullets(friendlyBulletPool, friendlyBullets, friendlyBulletTree, Bullet.prototype.moveDt, dt);
	iterateBullets(enemyBulletPool, enemyBullets, enemyBulletTree, Bullet.prototype.moveDt, dt);
	
	iterateGravityWells(attractPool, attractors, GravityWell.prototype.fadeDt, dt);
	iterateGravityWells(repulsePool, repulsers, GravityWell.prototype.fadeDt, dt);
	
	iterateHunters(hunterPool, hunters, Hunter.prototype.moveDt, dt);
	iterateHunterHulls(hullPool, hulls, HunterHull.prototype.moveDt, dt);
	
	// you do all kinds of crazy shit
	if (player !== undefined) {
		player.moveDt(dt);
	}
	
	if (thePackage !== undefined) {
		thePackage.moveDt(dt);
	}
	if (theDestination !== undefined) {
		theDestination.moveDt(dt);
	}
};
function collideThings(dt) {
	iterateHunters(hunterPool, hunters, Hunter.prototype.collide, dt);
	if (player.collide()) {
		gameOver();
	}
}


function buyHealth() {
	if (player.cash >= 120) {
		player.cash -= 120;
		player.health += 10;
		if (player.health > 100) {
			player.health = 100;
		}
	} else {
		failSnd.play()
	}
}
function buyBulletUpgrade() {
	if (player.cash >= 200) {
		player.cash -= 200;
		player.bulletUpgrade++;
		timers.push(setTimeout(function() {
			player.bulletUpgrade--;
		}, 60000));
	} else {
		failSnd.play()
	}
}

function gunShotLoop() {
	if (mode === 'play') {
		if (player === undefined) { return; }
		if (player.gwellCooldown > 0) {
			player.gwellCooldown--;
		}
		if (control.z) {
			player.fireBullet();
			player.bulletScatter += 0.1;
			
		}
		player.bulletScatter *= 0.8;
	
		for (var i=0; i<hunters.length; i++) {
			hunters[i].fireBullet();
		}
	}
}
function escalate() {
	var scale = (player.deliveries + player.kills/5)
	maxHunters = 9 + parseInt(scale/2);
	bulletDamage = 3 + parseInt(scale/4);
	hunterHealth = 2 + parseInt(scale/6);
	if (hunters.length < maxHunters) {
		assignHunter(hunterPool, hunters,
			Math.random()*2000 - 1000,
			Math.random()*2000 - 1000,
			Math.random()*6.28,
			hunterHealth
		);
	}
}

var lTime = (new Date())-1;
function gameLoop() {
	var time = (new Date);
	var dt = (time - lTime)/500;
	lTime = time;
	requestAnimationFrame(gameLoop);
	if (!pause && mode == 'play') {
		// TODO: real delta time
		moveThings(dt);
		collideThings();
	}
	renderer.clear();
	renderer.render(scene, camera);	
}



function updateUI() {
	if (player !== undefined) {
		$('health').innerHTML = player.health;
		$('money').innerHTML = player.cash;
		$('score').innerHTML = player.score;
	} else {
		$('health').innerHTML = 0;
		$('money').innerHTML = 0;
		$('score').innerHTML = 0;
	}
}


init();


}; // window.onload