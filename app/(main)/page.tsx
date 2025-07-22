import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-8 py-16">
      <div className="text-center space-y-8">
        <h1 className="text-6xl font-bold text-gray-900">
          Welcome to Offerbase
        </h1>
        <p className="text-2xl text-gray-600 max-w-3xl mx-auto">
          Streamline your offer management process with our powerful platform
        </p>
        
        <div className="flex gap-4 justify-center pt-8">
          <Link href="/auth/signup">
            <Button size="lg" className="px-8">
              Get Started
            </Button>
          </Link>
          <Link href="/auth/login">
            <Button variant="outline" size="lg" className="px-8">
              Sign In
            </Button>
          </Link>
        </div>

        <div className="pt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">Easy Management</h3>
            <p className="text-gray-600">
              Manage all your offers in one centralized location
            </p>
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">Real-time Updates</h3>
            <p className="text-gray-600">
              Get instant notifications on offer status changes
            </p>
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">Analytics</h3>
            <p className="text-gray-600">
              Track performance metrics and optimize your strategy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}