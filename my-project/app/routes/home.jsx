import ModelAndScansViewer from '../components/ModelAndScansViewer';

export function meta() {
  return [
    { title: "360° Virtual Tour" },
    { name: "description", content: "Immersive Matterport-style 360° virtual tour" },
  ];
}

export default function HomePage() {
  return <ModelAndScansViewer />;
}