'use client';

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { 
  TrendingUp, 
  Clock, 
  Users, 
  DollarSign,
  CheckCircle,
  Target,
  Zap
} from 'lucide-react';
import { useEffect, useState } from 'react';

const BenefitsSection = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1
  });

  return (
    <section className="py-32 bg-gradient-to-b from-white to-gray-50" ref={ref}>
      <div className="max-w-7xl mx-auto px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Why thousands choose
            <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Offerbase
            </span>
          </h2>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Don&apos;t just take our word for it. See the real impact Offerbase has on 
            affiliate marketing businesses of all sizes.
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20"
        >
          {[
            {
              icon: TrendingUp,
              value: '347%',
              label: 'Average ROI Increase',
              color: 'from-green-500 to-emerald-500'
            },
            {
              icon: Clock,
              value: '73%',
              label: 'Time Saved Weekly',
              color: 'from-blue-500 to-cyan-500'
            },
            {
              icon: Users,
              value: '10K+',
              label: 'Active Users',
              color: 'from-purple-500 to-pink-500'
            },
            {
              icon: DollarSign,
              value: '$2.4M',
              label: 'Revenue Generated',
              color: 'from-yellow-500 to-orange-500'
            }
          ].map((stat, index) => (
            <AnimatedStat
              key={stat.label}
              icon={stat.icon}
              value={stat.value}
              label={stat.label}
              color={stat.color}
              delay={index * 0.1}
              inView={inView}
            />
          ))}
        </motion.div>

        {/* Before/After Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mb-20"
        >
          <div className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="p-8">
              <h3 className="text-3xl font-bold text-gray-900 text-center mb-12">
                Transform Your Affiliate Business
              </h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Before */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                      <Target className="h-6 w-6 text-red-600" />
                    </div>
                    <h4 className="text-2xl font-bold text-gray-900">Before Offerbase</h4>
                  </div>
                  
                  {[
                    'Manual tracking in spreadsheets',
                    'Generic, non-converting widgets',
                    'No real-time performance insights',
                    'Hours spent on administrative tasks',
                    'Limited customer engagement tools'
                  ].map((item, index) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, x: -20 }}
                      animate={inView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.7 + index * 0.1, duration: 0.5 }}
                      className="flex items-center space-x-3"
                    >
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-gray-600">{item}</span>
                    </motion.div>
                  ))}
                </div>

                {/* After */}
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <Zap className="h-6 w-6 text-green-600" />
                    </div>
                    <h4 className="text-2xl font-bold text-gray-900">After Offerbase</h4>
                  </div>
                  
                  {[
                    'Automated analytics and reporting',
                    'AI-powered, high-converting widgets',
                    'Real-time performance dashboard',
                    'Streamlined workflow automation',
                    'Intelligent customer engagement'
                  ].map((item, index) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, x: 20 }}
                      animate={inView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.7 + index * 0.1, duration: 0.5 }}
                      className="flex items-center space-x-3"
                    >
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-gray-800 font-medium">{item}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Customer Success Stories */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {[
            {
              quote: "Offerbase transformed our affiliate program. We saw a 300% increase in conversions within the first month.",
              author: "Sarah Chen",
              role: "Marketing Director, TechCorp",
              result: "+300% conversions"
            },
            {
              quote: "The AI-powered recommendations are incredible. Our customers love the personalized experience.",
              author: "Mike Rodriguez",
              role: "Founder, EcomPlus",
              result: "+185% engagement"
            },
            {
              quote: "We save 20+ hours weekly on admin tasks. The automation features are a game-changer.",
              author: "Emily Johnson",
              role: "Affiliate Manager, GrowthCo",
              result: "20+ hours saved"
            }
          ].map((testimonial, index) => (
            <motion.div
              key={testimonial.author}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.9 + index * 0.1, duration: 0.6 }}
              whileHover={{ y: -10, scale: 1.02 }}
              className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300"
            >
              <div className="mb-6">
                <p className="text-gray-700 italic leading-relaxed">&ldquo;{testimonial.quote}&rdquo;</p>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{testimonial.author}</div>
                  <div className="text-sm text-gray-600">{testimonial.role}</div>
                </div>
                <div className="bg-gradient-to-r from-blue-100 to-indigo-100 px-3 py-1 rounded-full">
                  <span className="text-blue-700 font-semibold text-sm">{testimonial.result}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

// Animated Statistics Component
const AnimatedStat = ({ 
  icon: Icon, 
  value, 
  label, 
  color, 
  delay, 
  inView 
}: {
  icon: React.ComponentType<{ className?: string; size?: number; }>;
  value: string;
  label: string;
  color: string;
  delay: number;
  inView: boolean;
}) => {
  const [displayValue, setDisplayValue] = useState('0');

  useEffect(() => {
    if (!inView) return;

    const numericValue = parseInt(value.replace(/[^0-9]/g, ''));
    const suffix = value.replace(/[0-9]/g, '');
    
    if (isNaN(numericValue)) {
      setDisplayValue(value);
      return;
    }

    let start = 0;
    const duration = 2000;
    const increment = numericValue / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= numericValue) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(start) + suffix);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [inView, value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.6 }}
      whileHover={{ y: -5, scale: 1.05 }}
      className="group bg-white rounded-2xl p-8 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 text-center"
    >
      <motion.div
        whileHover={{ rotate: 10, scale: 1.1 }}
        className={`inline-flex p-4 rounded-2xl bg-gradient-to-r ${color} mb-4`}
      >
        <Icon className="h-8 w-8 text-white" />
      </motion.div>
      
      <div className="text-4xl font-bold text-gray-900 mb-2 group-hover:text-purple-900 transition-colors">
        {displayValue}
      </div>
      
      <div className="text-gray-600 font-medium">
        {label}
      </div>
      
      <motion.div
        initial={{ width: 0 }}
        animate={inView ? { width: '100%' } : {}}
        transition={{ delay: delay + 0.5, duration: 0.8 }}
        className={`h-1 bg-gradient-to-r ${color} rounded-full mt-4 mx-auto`}
      />
    </motion.div>
  );
};

export default BenefitsSection;