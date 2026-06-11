// Sun: simple emissive sphere + ambient/point light.
// Real photometric tuning happens after textures land.
export function Sun() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[3.4, 48, 48]} />
        <meshBasicMaterial color="#ffe9a8" />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={2.4} decay={0} />
    </group>
  );
}
