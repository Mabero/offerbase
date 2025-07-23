'use client';

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { 
  MessageSquare, 
  BarChart3, 
  Zap, 
  Shield, 
  Palette, 
  Globe,
  ArrowRight,
  Sparkles
} from 'lucide-react';

const features = [
  {
    icon: MessageSquare,
    title: "Smart Chat Widgets",
    description: "AI-powered chat interfaces that engage visitors and guide them through your affiliate products with intelligent recommendations.",
    color: "from-blue-500 to-cyan-500",
    delay: 0.1
  },
  {
    icon: BarChart3,
    title: "Real-time Analytics",
    description: "Track conversions, monitor performance, and optimize your strategy with comprehensive analytics and insights.",
    color: "from-purple-500 to-pink-500",
    delay: 0.2
  },
  {
    icon: Zap,
    title: "Lightning Fast Setup",
    description: "Get your affiliate program running in minutes with our streamlined onboarding and instant widget deployment.",
    color: "from-yellow-500 to-orange-500",
    delay: 0.3
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-level security with SOC 2 compliance, end-to-end encryption, and comprehensive audit trails.",
    color: "from-green-500 to-emerald-500",
    delay: 0.4
  },
  {
    icon: Palette,
    title: "Custom Branding",
    description: "Fully customizable widgets that seamlessly match your brand identity and website design.",
    color: "from-indigo-500 to-purple-500",
    delay: 0.5
  },
  {
    icon: Globe,
    title: "Global Scale",
    description: "Worldwide CDN, multi-language support, and 99.9% uptime SLA to serve customers anywhere.",
    color: "from-teal-500 to-blue-500",
    delay: 0.6
  }
];

const FeaturesSection = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1
  });

  return (
    <section className="py-32 bg-gradient-to-b from-slate-50 to-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="inline-flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-full mb-6"
          >
            <Sparkles className="h-4 w-4 text-blue-600" />
            <span className="text-blue-800 font-medium">Powerful Features</span>
          </motion.div>
          
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Everything you need to
            <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              dominate affiliate marketing
            </span>
          </h2>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our comprehensive platform provides all the tools, analytics, and automation 
            you need to maximize your affiliate revenue and scale your business.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature) => {
            const Icon = feature.icon;
            
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 50 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: feature.delay, duration: 0.8 }}
                whileHover={{ y: -10, scale: 1.02 }}
                className="group relative"
              >
                <div className="relative p-8 bg-white rounded-3xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all duration-500 h-full">
                  {/* Gradient Border Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl" />
                  
                  {/* Icon Container */}
                  <motion.div
                    whileHover={{ rotate: 10, scale: 1.1 }}
                    className={`inline-flex p-4 rounded-2xl bg-gradient-to-r ${feature.color} mb-6`}
                  >
                    <Icon className="h-8 w-8 text-white" />
                  </motion.div>

                  {/* Content */}
                  <h3 className="text-2xl font-bold text-gray-900 mb-4 group-hover:text-blue-900 transition-colors">
                    {feature.title}
                  </h3>
                  
                  <p className="text-gray-600 leading-relaxed mb-6">
                    {feature.description}
                  </p>

                  {/* Learn More Link */}
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    whileHover={{ opacity: 1, x: 0 }}
                    className="flex items-center space-x-2 text-blue-600 font-medium group-hover:text-blue-700 transition-colors"
                  >
                    <span>Learn more</span>
                    <motion.div
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="text-center mt-20"
        >
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-3xl p-12 text-white">
            <h3 className="text-3xl font-bold mb-4">
              Ready to transform your affiliate business?
            </h3>
            <p className="text-xl text-gray-200 mb-8 max-w-2xl mx-auto">
              Join thousands of successful affiliates who are already using Offerbase 
              to maximize their revenue and streamline their operations.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-white text-gray-900 px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-gray-100 transition-colors shadow-xl"
            >
              Start Your Free Trial
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default FeaturesSection;