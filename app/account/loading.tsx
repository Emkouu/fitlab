import { Spinner } from "../_components/Spinner";

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfafd]">
      <Spinner size={40} />
    </div>
  );
}
