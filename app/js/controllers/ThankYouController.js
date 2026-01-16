'use strict';

foodMeApp.controller('ThankYouController', function ThankYouController($scope, $location) {
  $scope.orderId = $location.search().orderId;
});




