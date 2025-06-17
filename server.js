import random
import math
from datetime import datetime, time
from typing import Dict, Tuple
import json

class MotelPricingEngine:
    """
    Dynamic pricing engine for motels with FOMO psychology and demand-based adjustments.
    Designed to maximize revenue while avoiding commission-heavy platforms.
    """
    
    def __init__(self, motel_id: str, total_rooms: int = 15):
        self.motel_id = motel_id
        self.total_rooms = total_rooms
        self.price_history = []  # Track price changes for momentum
        
        # Pricing constraints (80% to 120% of base price)
        self.MIN_MULTIPLIER = 0.80
        self.MAX_MULTIPLIER = 1.20
        
        # FOMO psychology weights
        self.FOMO_WEIGHTS = {
            'occupancy_urgency': 0.35,    # Primary driver
            'day_demand': 0.25,           # Day of week importance
            'time_pressure': 0.20,        # Time-based urgency
            'traffic_momentum': 0.15,     # User activity
            'randomness': 0.05           # Market volatility
        }
    
    def calculate_dynamic_price(
        self,
        base_price: float,
        day_of_week: int,  # 0=Monday, 6=Sunday
        current_occupancy: float,  # 0.0 to 1.0
        time_of_day: int,  # 24hr format (0-23)
        previous_price: float,
        user_traffic: int,  # Number of users viewing
        minutes_since_last_change: int = 1
    ) -> Dict:
        """
        Calculate new price with FOMO psychology and business intelligence.
        
        Returns:
            {
                'new_price': float,
                'price_change': float,
                'fomo_message': str,
                'urgency_level': str,
                'reasoning': str
            }
        """
        
        # 1. DAY-OF-WEEK DEMAND MULTIPLIER
        day_multiplier = self._get_day_multiplier(day_of_week, time_of_day)
        
        # 2. OCCUPANCY-BASED PRICING (Core FOMO driver)
        occupancy_multiplier = self._get_occupancy_multiplier(
            current_occupancy, day_of_week, time_of_day
        )
        
        # 3. TIME-PRESSURE MULTIPLIER
        time_multiplier = self._get_time_pressure_multiplier(time_of_day, day_of_week)
        
        # 4. TRAFFIC MOMENTUM MULTIPLIER
        traffic_multiplier = self._get_traffic_multiplier(user_traffic, current_occupancy)
        
        # 5. SMART RANDOMNESS (Market volatility simulation)
        volatility_multiplier = self._get_smart_volatility(
            previous_price, base_price, current_occupancy
        )
        
        # 6. CALCULATE NEW PRICE
        price_multiplier = (
            day_multiplier * self.FOMO_WEIGHTS['day_demand'] +
            occupancy_multiplier * self.FOMO_WEIGHTS['occupancy_urgency'] +
            time_multiplier * self.FOMO_WEIGHTS['time_pressure'] +
            traffic_multiplier * self.FOMO_WEIGHTS['traffic_momentum'] +
            volatility_multiplier * self.FOMO_WEIGHTS['randomness']
        )
        
        # Apply constraints (80% to 120% of base price)
        price_multiplier = max(self.MIN_MULTIPLIER, min(self.MAX_MULTIPLIER, price_multiplier))
        
        new_price = round(base_price * price_multiplier, 2)
        price_change = new_price - previous_price
        
        # 7. GENERATE FOMO MESSAGING
        fomo_data = self._generate_fomo_messaging(
            new_price, previous_price, current_occupancy, user_traffic, day_of_week
        )
        
        # 8. TRACK PRICE HISTORY FOR MOMENTUM
        self._update_price_history(new_price, price_change)
        
        return {
            'new_price': new_price,
            'price_change': price_change,
            'price_multiplier': price_multiplier,
            'fomo_message': fomo_data['message'],
            'urgency_level': fomo_data['urgency'],
            'reasoning': fomo_data['reasoning'],
            'components': {
                'day_factor': day_multiplier,
                'occupancy_factor': occupancy_multiplier,
                'time_factor': time_multiplier,
                'traffic_factor': traffic_multiplier,
                'volatility_factor': volatility_multiplier
            }
        }
    
    def _get_day_multiplier(self, day_of_week: int, time_of_day: int) -> float:
        """Calculate demand multiplier based on day of week and business patterns."""
        
        # Base day multipliers (your business intelligence)
        day_base = {
            0: 0.85,  # Monday - Low demand
            1: 0.90,  # Tuesday - Low demand  
            2: 0.95,  # Wednesday - Building
            3: 1.05,  # Thursday - Pre-weekend
            4: 1.25,  # Friday - High demand
            5: 1.30,  # Saturday - Peak demand
            6: 1.15   # Sunday - Moderate demand
        }
        
        base_multiplier = day_base[day_of_week]
        
        # Time-of-day adjustments for weekend demand
        if day_of_week >= 4:  # Friday-Sunday
            if 14 <= time_of_day <= 18:  # 2-6 PM critical booking window
                base_multiplier *= 1.15
            elif time_of_day >= 20:  # Late evening urgency
                base_multiplier *= 1.10
                
        return base_multiplier
    
    def _get_occupancy_multiplier(self, occupancy: float, day_of_week: int, time_of_day: int) -> float:
        """Core FOMO driver - occupancy-based pricing with psychological triggers."""
        
        if day_of_week >= 4:  # Weekend (Fri-Sun) - Revenue maximization
            if occupancy >= 0.90:
                return 1.20  # 90%+ = Maximum FOMO pricing
            elif occupancy >= 0.80:
                return 1.15  # 80%+ = High urgency
            elif occupancy >= 0.70:
                return 1.12  # 70%+ = Building pressure
            elif occupancy >= 0.50:
                return 1.08  # 50%+ = Moderate premium
            else:
                return 1.05  # Low occupancy = slight premium (weekend baseline)
                
        elif day_of_week <= 2:  # Monday-Wednesday - Fill rooms strategy
            if occupancy >= 0.70:
                return 1.10  # Surprisingly full = raise prices
            elif occupancy >= 0.50:
                return 1.02  # Half full = slight premium
            elif occupancy >= 0.30:
                return 0.95  # Low = discount to attract
            else:
                return 0.85  # Very low = aggressive discount
                
        else:  # Thursday - Balanced approach
            if occupancy >= 0.80:
                return 1.12
            elif occupancy >= 0.60:
                return 1.08
            elif occupancy >= 0.40:
                return 1.00
            else:
                return 0.92
    
    def _get_time_pressure_multiplier(self, time_of_day: int, day_of_week: int) -> float:
        """Time-based urgency pricing for maximum FOMO effect."""
        
        # Critical booking windows
        if 14 <= time_of_day <= 18:  # 2-6 PM - Peak booking time
            return 1.08
        elif 19 <= time_of_day <= 22:  # 7-10 PM - Same-day urgency
            return 1.12
        elif time_of_day >= 23 or time_of_day <= 2:  # Late night - Desperate bookings
            return 1.15
        elif 6 <= time_of_day <= 10:  # Morning - Early bird planning
            return 0.95
        else:
            return 1.00
    
    def _get_traffic_multiplier(self, user_traffic: int, occupancy: float) -> float:
        """Traffic momentum - more viewers = higher demand signal."""
        
        # Normalize traffic (assuming 1-50 concurrent viewers is normal range)
        if user_traffic >= 30:
            traffic_factor = 1.10  # High traffic = demand surge
        elif user_traffic >= 20:
            traffic_factor = 1.05  # Moderate traffic
        elif user_traffic >= 10:
            traffic_factor = 1.02  # Normal traffic
        elif user_traffic >= 5:
            traffic_factor = 1.00  # Low traffic
        else:
            traffic_factor = 0.98  # Very low traffic = slight discount
            
        # Amplify traffic effect when occupancy is high (scarcity + demand)
        if occupancy >= 0.80 and user_traffic >= 20:
            traffic_factor *= 1.05  # Compound effect
            
        return traffic_factor
    
    def _get_smart_volatility(self, previous_price: float, base_price: float, occupancy: float) -> float:
        """Smart randomness that creates market-like volatility with business intelligence."""
        
        # Base volatility
        random_factor = random.uniform(-0.03, 0.03)  # ±3% base volatility
        
        # Increase volatility during high-stakes periods
        if occupancy >= 0.75:
            random_factor *= 1.5  # More dramatic swings when nearly full
        elif occupancy <= 0.30:
            random_factor *= 1.3  # More dramatic discounts when empty
            
        # Momentum-based adjustments (simulate market psychology)
        price_vs_base = previous_price / base_price
        if price_vs_base > 1.10:  # Price well above base
            random_factor -= 0.01  # Slight downward pressure
        elif price_vs_base < 0.90:  # Price well below base  
            random_factor += 0.01  # Slight upward pressure
            
        return 1.0 + random_factor
    
    def _generate_fomo_messaging(
        self, 
        new_price: float, 
        previous_price: float, 
        occupancy: float, 
        traffic: int, 
        day_of_week: int
    ) -> Dict:
        """Generate FOMO messages and urgency levels for maximum psychological impact."""
        
        price_change = new_price - previous_price
        price_change_pct = (price_change / previous_price) * 100 if previous_price > 0 else 0
        
        # Determine urgency level
        if occupancy >= 0.85:
            urgency = "CRITICAL"
        elif occupancy >= 0.70:
            urgency = "HIGH"
        elif occupancy >= 0.50:
            urgency = "MEDIUM"
        else:
            urgency = "LOW"
            
        # Generate context-aware FOMO messages
        messages = []
        
        # Price movement messages
        if abs(price_change) >= 2:
            if price_change > 0:
                messages.append(f"🔥 PRICE SURGE! +${abs(price_change):.0f} in the last minute!")
            else:
                messages.append(f"📉 FLASH DROP! -${abs(price_change):.0f} limited time!")
        elif abs(price_change) >= 1:
            if price_change > 0:
                messages.append(f"📈 Price climbing: +${price_change:.0f}")
            else:
                messages.append(f"💰 Deal alert: -${abs(price_change):.0f}")
                
        # Occupancy-based messages
        rooms_left = max(1, int(self.total_rooms * (1 - occupancy)))
        if occupancy >= 0.90:
            messages.append(f"🚨 ONLY {rooms_left} ROOMS LEFT!")
        elif occupancy >= 0.80:
            messages.append(f"⚡ {rooms_left} rooms remaining at this price")
        elif occupancy >= 0.70:
            messages.append(f"🏃‍♂️ Filling up fast - {rooms_left} left")
            
        # Traffic-based messages
        if traffic >= 25:
            messages.append(f"👀 {traffic} people viewing this deal!")
        elif traffic >= 15:
            messages.append(f"🔥 High demand - {traffic} active viewers")
            
        # Day-specific messages
        if day_of_week >= 4 and occupancy >= 0.70:
            messages.append("🎉 Weekend rush - book before it's gone!")
        elif day_of_week <= 2 and price_change < 0:
            messages.append("💡 Weekday special - limited time pricing!")
            
        # Select best message or combine
        if messages:
            primary_message = messages[0]
            if len(messages) > 1:
                primary_message += f" {messages[1]}"
        else:
            primary_message = f"Current rate: ${new_price:.0f}"
            
        # Generate reasoning for transparency/debugging
        reasoning_parts = []
        if abs(price_change_pct) >= 2:
            reasoning_parts.append(f"Price moved {price_change_pct:+.1f}%")
        reasoning_parts.append(f"{occupancy:.0%} occupied")
        if traffic >= 20:
            reasoning_parts.append(f"High traffic ({traffic} viewers)")
        reasoning = " | ".join(reasoning_parts)
        
        return {
            'message': primary_message,
            'urgency': urgency,
            'reasoning': reasoning
        }
    
    def _update_price_history(self, new_price: float, change: float):
        """Track price history for momentum analysis."""
        self.price_history.append({
            'price': new_price,
            'change': change,
            'timestamp': datetime.now().isoformat()
        })
        
        # Keep only last 10 price points
        if len(self.price_history) > 10:
            self.price_history.pop(0)
    
    def get_price_trend(self) -> str:
        """Analyze recent price trend for additional FOMO messaging."""
        if len(self.price_history) < 3:
            return "STABLE"
            
        recent_changes = [item['change'] for item in self.price_history[-3:]]
        total_change = sum(recent_changes)
        
        if total_change >= 5:
            return "SURGING"
        elif total_change <= -5:
            return "DROPPING"
        elif abs(total_change) <= 2:
            return "STABLE"
        else:
            return "VOLATILE"


# Example usage and testing
def simulate_pricing_scenario():
    """Simulate real-world pricing scenarios for Signal Hill Motel."""
    
    engine = MotelPricingEngine("signal_hill_motel", total_rooms=15)
    
    # Test scenarios
    scenarios = [
        {
            "name": "Friday Evening Rush",
            "base_price": 86,
            "day_of_week": 4,  # Friday
            "occupancy": 0.85,
            "time_of_day": 19,  # 7 PM
            "traffic": 28
        },
        {
            "name": "Tuesday Morning Slow",
            "base_price": 86,
            "day_of_week": 1,  # Tuesday
            "occupancy": 0.25,
            "time_of_day": 10,  # 10 AM
            "traffic": 3
        },
        {
            "name": "Saturday Peak",
            "base_price": 86,
            "day_of_week": 5,  # Saturday
            "occupancy": 0.95,
            "time_of_day": 15,  # 3 PM
            "traffic": 45
        }
    ]
    
    print("=== SIGNAL HILL MOTEL DYNAMIC PRICING SIMULATION ===\n")
    
    for scenario in scenarios:
        print(f"📊 SCENARIO: {scenario['name']}")
        print(f"Base Price: ${scenario['base_price']}")
        print(f"Day: {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][scenario['day_of_week']]}")
        print(f"Occupancy: {scenario['occupancy']:.0%}")
        print(f"Time: {scenario['time_of_day']}:00")
        print(f"Traffic: {scenario['traffic']} viewers")
        
        # Simulate price changes over 5 minutes
        previous_price = scenario['base_price']
        
        for minute in range(1, 6):
            result = engine.calculate_dynamic_price(
                base_price=scenario['base_price'],
                day_of_week=scenario['day_of_week'],
                current_occupancy=scenario['occupancy'],
                time_of_day=scenario['time_of_day'],
                previous_price=previous_price,
                user_traffic=scenario['traffic'],
                minutes_since_last_change=1
            )
            
            print(f"  Minute {minute}: ${result['new_price']:.0f} ({result['price_change']:+.0f}) - {result['fomo_message']}")
            previous_price = result['new_price']
            
            # Simulate slight changes in traffic/occupancy
            scenario['traffic'] += random.randint(-3, 3)
            scenario['occupancy'] += random.uniform(-0.02, 0.02)
            scenario['occupancy'] = max(0, min(1, scenario['occupancy']))
        
        print(f"  💡 Trend: {engine.get_price_trend()}")
        print("\n" + "="*50 + "\n")

# Run simulation
if __name__ == "__main__":
    simulate_pricing_scenario()