'use client';

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { 
  Check, 
  X, 
  Crown,
  Zap,
  ArrowRight,
  Star,
  Shield,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const PricingSection = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1
  });

  const plans = [
    {
      name: 'Starter',
      price: 29,
      description: 'Perfect for small businesses and solo entrepreneurs',
      icon: Zap,
      color: 'from-blue-500 to-cyan-500',
      popular: false,
      features: [
        { name: 'Up to 5 chat widgets', included: true },
        { name: 'Basic analytics dashboard', included: true },
        { name: 'Email support', included: true },
        { name: '100 affiliate links', included: true },
        { name: 'Custom branding', included: false },
        { name: 'API access', included: false },
        { name: 'Priority support', included: false },
        { name: 'Advanced AI features', included: false }
      ]
    },
    {
      name: 'Professional',
      price: 79,
      description: 'Ideal for growing businesses and marketing teams',
      icon: Crown,
      color: 'from-purple-500 to-pink-500',
      popular: true,
      features: [
        { name: 'Up to 25 chat widgets', included: true },
        { name: 'Advanced analytics & insights', included: true },
        { name: 'Priority email & chat support', included: true },
        { name: 'Unlimited affiliate links', included: true },
        { name: 'Full custom branding', included: true },
        { name: 'Basic API access', included: true },
        { name: 'A/B testing tools', included: true },
        { name: 'Advanced AI features', included: false }
      ]
    },
    {
      name: 'Enterprise',
      price: 199,
      description: 'For large organizations with advanced needs',
      icon: Shield,
      color: 'from-gray-600 to-gray-700',
      popular: false,
      features: [
        { name: 'Unlimited chat widgets', included: true },
        { name: 'Enterprise analytics suite', included: true },
        { name: '24/7 dedicated support', included: true },
        { name: 'Unlimited affiliate links', included: true },
        { name: 'White-label solution', included: true },
        { name: 'Full API access', included: true },
        { name: 'Advanced A/B testing', included: true },
        { name: 'Custom AI model training', included: true }
      ]
    }
  ];

  return (
    <section className="py-32 bg-gradient-to-b from-gray-100 to-white" ref={ref}>
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
            <span className="text-blue-800 font-medium">Simple Pricing</span>
          </motion.div>

          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Choose your
            <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              perfect plan
            </span>
          </h2>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Start free, scale as you grow. All plans include our core features 
            with no setup fees or hidden costs.
          </p>

          {/* Pricing Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="inline-flex items-center space-x-4 bg-gray-100 rounded-full p-1"
          >
            <button className="px-6 py-2 bg-white text-gray-900 rounded-full font-medium shadow-sm">
              Monthly
            </button>
            <button className="px-6 py-2 text-gray-600 rounded-full font-medium">
              Annual (Save 20%)
            </button>
          </motion.div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{ delay: 0.2 + index * 0.1, duration: 0.8 }}
                whileHover={{ y: -10, scale: 1.02 }}
                className={`relative bg-white rounded-3xl shadow-xl border-2 transition-all duration-300 ${
                  plan.popular 
                    ? 'border-blue-500 shadow-blue-500/25' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={inView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ delay: 0.5, duration: 0.6 }}
                    className="absolute -top-5 left-1/2 transform -translate-x-1/2"
                  >
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-full text-sm font-semibold flex items-center space-x-1">
                      <Star className="h-4 w-4 fill-current" />
                      <span>Most Popular</span>
                    </div>
                  </motion.div>
                )}

                <div className="p-8">
                  {/* Plan Header */}
                  <div className="text-center mb-8">
                    <motion.div
                      whileHover={{ rotate: 10, scale: 1.1 }}
                      className={`inline-flex p-4 rounded-2xl bg-gradient-to-r ${plan.color} mb-4`}
                    >
                      <Icon className="h-8 w-8 text-white" />
                    </motion.div>
                    
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {plan.name}
                    </h3>
                    
                    <p className="text-gray-600 mb-6">
                      {plan.description}
                    </p>

                    {/* Price */}
                    <div className="flex items-baseline justify-center space-x-1">
                      <span className="text-5xl font-bold text-gray-900">
                        ${plan.price}
                      </span>
                      <span className="text-xl text-gray-600">
                        /month
                      </span>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="space-y-4 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <motion.div
                        key={feature.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={inView ? { opacity: 1, x: 0 } : {}}
                        transition={{ 
                          delay: 0.6 + index * 0.1 + featureIndex * 0.05, 
                          duration: 0.5 
                        }}
                        className="flex items-center space-x-3"
                      >
                        {feature.included ? (
                          <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <X className="h-5 w-5 text-gray-300 flex-shrink-0" />
                        )}
                        <span className={`${
                          feature.included ? 'text-gray-900' : 'text-gray-400'
                        }`}>
                          {feature.name}
                        </span>
                      </motion.div>
                    ))}
                  </div>

                  {/* CTA Button */}
                  <Link href="/auth/signup">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        className={`w-full py-4 text-lg font-semibold ${
                          plan.popular
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                            : 'bg-gray-900 hover:bg-gray-800'
                        }`}
                      >
                        {plan.name === 'Enterprise' ? 'Contact Sales' : 'Start Free Trial'}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </motion.div>
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="text-center"
        >
          <h3 className="text-3xl font-bold text-gray-900 mb-8">
            Frequently Asked Questions
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[
              {
                question: 'Can I change plans anytime?',
                answer: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.'
              },
              {
                question: 'Is there a free trial?',
                answer: 'All plans include a 14-day free trial with full access to features. No credit card required.'
              },
              {
                question: 'What payment methods do you accept?',
                answer: 'We accept all major credit cards, PayPal, and wire transfers for Enterprise customers.'
              },
              {
                question: 'Do you offer refunds?',
                answer: 'Yes, we offer a 30-day money-back guarantee if you\'re not completely satisfied.'
              }
            ].map((faq, index) => (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1 + index * 0.1, duration: 0.6 }}
                className="text-left bg-white rounded-2xl p-6 shadow-lg border border-gray-100"
              >
                <h4 className="font-semibold text-gray-900 mb-2">
                  {faq.question}
                </h4>
                <p className="text-gray-600">
                  {faq.answer}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Final CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="mt-16 bg-gradient-to-r from-gray-800 to-gray-900 rounded-3xl p-12 text-white"
          >
            <h3 className="text-3xl font-bold mb-4">
              Ready to transform your affiliate business?
            </h3>
            <p className="text-xl text-gray-200 mb-8 max-w-2xl mx-auto">
              Join thousands of successful affiliates and start your free trial today. 
              No commitment, cancel anytime.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/signup">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button size="lg" className="px-8 py-4 bg-white text-gray-900 hover:bg-gray-100">
                    Start Free Trial
                  </Button>
                </motion.div>
              </Link>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="px-8 py-4 border-white/30 text-white hover:bg-white/10"
                >
                  Schedule Demo
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default PricingSection;