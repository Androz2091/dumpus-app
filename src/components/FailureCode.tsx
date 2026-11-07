export default function FailureCode({ code }: { code?: string | null }) {
  if (!code) return null;
  return (
    <p className="mb-4 text-center font-mono text-xs text-gray-500">{code}</p>
  );
}
