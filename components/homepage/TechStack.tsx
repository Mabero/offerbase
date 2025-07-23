'use client';

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { 
  Shield, 
  Zap, 
  Globe, 
  Lock,
  CheckCircle,
  ArrowRight,
  Server,
  Database,
  Cloud,
  Cpu
} from 'lucide-react';

const TechStack = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1
  });

  const technologies = [
    {
      name: 'Next.js',
      description: 'React framework for production',
      logo: '⚡',
      category: 'Frontend'
    },
    {
      name: 'Supabase',
      description: 'Open source Firebase alternative',
      logo: '🗄️',
      category: 'Database'
    },
    {
      name: 'OpenAI',
      description: 'GPT-4 powered AI features',
      logo: '🤖',
      category: 'AI/ML'
    },
    {
      name: 'Vercel',
      description: 'Edge computing platform',
      logo: '🌐',
      category: 'Infrastructure'
    },
    {
      name: 'TypeScript',
      description: 'Type-safe JavaScript',
      logo: '📘',
      category: 'Language'
    },
    {
      name: 'Tailwind CSS',
      description: 'Utility-first CSS framework',
      logo: '🎨',
      category: 'Styling'
    }
  ];

  const securityFeatures = [
    {
      icon: Shield,
      title: 'SOC 2 Type II Certified',
      description: 'Comprehensive security controls and audit compliance'
    },
    {
      icon: Lock,
      title: 'End-to-End Encryption',
      description: 'All data encrypted in transit and at rest with AES-256'
    },
    {
      icon: Server,
      title: 'GDPR Compliant',
      description: 'Full compliance with European data protection regulations'
    },
    {
      icon: Database,
      title: 'Regular Security Audits',
      description: 'Third-party penetration testing and vulnerability assessments'
    }
  ];

  const performanceMetrics = [
    {
      icon: Zap,
      title: '99.9% Uptime',
      description: 'Enterprise-grade reliability with global redundancy',
      value: '99.9%'
    },
    {
      icon: Globe,
      title: 'Global CDN',
      description: 'Sub-100ms response times worldwide',
      value: '<100ms'
    },
    {
      icon: Cloud,
      title: 'Auto Scaling',
      description: 'Handles millions of requests seamlessly',
      value: '10M+'
    },
    {
      icon: Cpu,
      title: 'Edge Computing',
      description: 'Processing at the edge for maximum speed',
      value: '50+ Locations'
    }
  ];

  return (
    <section className="py-32 bg-gradient-to-b from-gray-50 to-gray-100" ref={ref}>
      <div className="max-w-7xl mx-auto px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Built on
            <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              cutting-edge technology
            </span>
          </h2>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our platform leverages the latest technologies and industry best practices 
            to deliver unmatched performance, security, and scalability.
          </p>
        </motion.div>

        {/* Technology Stack */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mb-20"
        >
          <h3 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Powered by Modern Tech Stack
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {technologies.map((tech, index) => (
              <motion.div
                key={tech.name}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{ delay: 0.5 + index * 0.1, duration: 0.6 }}
                whileHover={{ y: -10, scale: 1.05 }}
                className="group bg-white rounded-2xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center space-x-4 mb-4">
                  <div className="text-4xl">{tech.logo}</div>
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {tech.name}
                    </h4>
                    <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                      {tech.category}
                    </span>
                  </div>
                </div>
                <p className="text-gray-600 group-hover:text-gray-700 transition-colors">
                  {tech.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Performance Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="mb-20"
        >
          <h3 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Enterprise-Grade Performance
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {performanceMetrics.map((metric, index) => {
              const Icon = metric.icon;
              return (
                <motion.div
                  key={metric.title}
                  initial={{ opacity: 0, y: 30 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.8 + index * 0.1, duration: 0.6 }}
                  whileHover={{ y: -5, scale: 1.02 }}
                  className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200 hover:border-blue-300 transition-all duration-300 text-center"
                >
                  <motion.div
                    whileHover={{ rotate: 10, scale: 1.1 }}
                    className="inline-flex p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 mb-4"
                  >
                    <Icon className="h-8 w-8 text-white" />
                  </motion.div>
                  
                  <div className="text-3xl font-bold text-gray-900 mb-2">
                    {metric.value}
                  </div>
                  
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    {metric.title}
                  </h4>
                  
                  <p className="text-gray-600 text-sm">
                    {metric.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Security Features */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.9, duration: 0.8 }}
          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-12 text-white"
        >
          <div className="text-center mb-12">
            <h3 className="text-4xl font-bold mb-4">
              Security You Can Trust
            </h3>
            <p className="text-xl text-gray-200 max-w-3xl mx-auto">
              Your data and your customers&apos; privacy are our top priority. 
              We implement military-grade security measures at every level.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {securityFeatures.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 1.1 + index * 0.1, duration: 0.6 }}
                  whileHover={{ scale: 1.05 }}
                  className="flex items-start space-x-4 bg-white/10 backdrop-blur-md rounded-2xl p-6 hover:bg-white/20 transition-all duration-300"
                >
                  <div className="bg-gradient-to-r from-blue-400 to-indigo-400 rounded-xl p-3">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold text-white mb-2">
                      {feature.title}
                    </h4>
                    <p className="text-gray-200">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Compliance Badges */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.3, duration: 0.8 }}
            className="flex justify-center items-center space-x-8 mt-12 pt-8 border-t border-white/20"
          >
            {['SOC 2', 'GDPR', 'CCPA', 'ISO 27001'].map((badge, index) => (
              <motion.div
                key={badge}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 1.5 + index * 0.1, duration: 0.5 }}
                whileHover={{ scale: 1.1 }}
                className="flex items-center space-x-2 bg-white/10 backdrop-blur-md rounded-full px-4 py-2"
              >
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-white font-medium">{badge}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.6, duration: 0.8 }}
            className="text-center mt-12"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center space-x-2 bg-white text-gray-900 px-8 py-4 rounded-2xl font-semibold text-lg hover:bg-gray-100 transition-colors shadow-xl"
            >
              <span>View Security Documentation</span>
              <ArrowRight className="h-5 w-5" />
            </motion.button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default TechStack;