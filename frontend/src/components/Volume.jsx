import Box from "@mui/material/Box";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { COLORS } from "../lib/ui.js";

// --- helpers ------------------------------------------------------------------------------------

// The site's centre and its longer side: the objects are built around the centre, so the coordinates stay small,
// and the camera distance follows the side.
function frame(polygon) {
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    size: Math.max(maxX - minX, maxY - minY),
  };
}

const toShape = (polygon, { cx, cy }) =>
  new THREE.Shape(polygon.map(([x, y]) => new THREE.Vector2(x - cx, y - cy)));

// The lines of a building: the footprint ring at every floor level and a vertical edge at every corner.
// With zero floors it is the ring on the ground, which also outlines the site.
function outline(polygon, floors, floorHeight, { cx, cy }) {
  const points = [];
  polygon.forEach(([x, y], index) => {
    const [nextX, nextY] = polygon[(index + 1) % polygon.length];
    for (let level = 0; level <= floors; level++) {
      const z = level * floorHeight;
      points.push(x - cx, y - cy, z, nextX - cx, nextY - cy, z);
    }
    points.push(x - cx, y - cy, 0, x - cx, y - cy, floors * floorHeight);
  });
  return new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
}

const lines = (geometry, color) =>
  new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));

// A building's solid: the footprint extruded by its height; flat when no floor fits.
const solid = (shape, height) =>
  height > 0
    ? new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
    : new THREE.ShapeGeometry(shape);

const floorHeight = ({ floor_count, height_m }) =>
  floor_count ? height_m / floor_count : 0;

function dispose(group) {
  for (const child of group.children) {
    child.geometry.dispose();
    child.material.dispose();
  }
  group.clear();
}

// --- component ----------------------------------------------------------------------------------

// The massing as volumes: the site flat on the ground, every building a translucent prism with its floors marked,
// the parent's buildings as outlines. Drag to orbit, wheel to zoom, right-drag to pan.
export default function Volume({ site, result, parentResult }) {
  const container = useRef(null);
  const sceneRef = useRef(null); // the camera, the controls and the group of drawn objects, created once

  // Renderer, camera, lights, controls: once; the canvas follows the container's size.
  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50);
    camera.up.set(0, 0, 1); // Z is the height; X and Y are the metres of the plan
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(1, -1, 2);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5), sun);
    const group = new THREE.Group();
    scene.add(group);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2; // never from below the ground
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const observer = new ResizeObserver(([{ contentRect }]) => {
      renderer.setSize(contentRect.width, contentRect.height);
      camera.aspect = contentRect.width / contentRect.height;
      camera.updateProjectionMatrix();
      render();
    });
    observer.observe(container.current);
    sceneRef.current = { camera, controls, group, render };
    return () => {
      observer.disconnect();
      controls.dispose();
      dispose(group);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // The camera is fitted to the site when the view opens and when the site changes — not on every recomputation.
  useEffect(() => {
    const { camera, controls, render } = sceneRef.current;
    const { size } = frame(site.polygon);
    camera.near = size / 100;
    camera.far = size * 100;
    camera.position.set(0, -1.5 * size, size);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
    render();
  }, [site]);

  // The objects: rebuilt on every change of the result — the live preview.
  useEffect(() => {
    const { group, render } = sceneRef.current;
    dispose(group);
    const center = frame(site.polygon);
    group.add(
      new THREE.Mesh(
        new THREE.ShapeGeometry(toShape(site.polygon, center)),
        // Pushed back in depth, so the footprints drawn on the ground win over it.
        new THREE.MeshBasicMaterial({
          color: COLORS.site,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        }),
      ),
      lines(outline(site.polygon, 0, 0, center), COLORS.siteEdge),
    );
    for (const { footprint } of result?.buildings ?? []) {
      const floors = result.metrics.floor_count;
      const height = floorHeight(result.metrics);
      group.add(
        new THREE.Mesh(
          solid(toShape(footprint, center), floors * height),
          new THREE.MeshLambertMaterial({
            color: COLORS.building,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
          }),
        ),
        lines(outline(footprint, floors, height, center), COLORS.building),
      );
    }
    for (const { footprint } of parentResult?.buildings ?? []) {
      const floors = parentResult.metrics.floor_count;
      const height = floorHeight(parentResult.metrics);
      group.add(
        lines(outline(footprint, floors, height, center), COLORS.parent),
      );
    }
    render();
  }, [site, result, parentResult]);

  return <Box ref={container} sx={{ height: "100%" }} />;
}
